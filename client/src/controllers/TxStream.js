import { serverConnected, serverDelay, lastBlockId } from '../stores.js'
import config from '../config.js'
import axios from 'axios'

let mempoolTimer
let lastBlockSeen
let ii=0
lastBlockId.subscribe(val => { lastBlockSeen = val })


class TxStream {
  constructor () {
    this.websocketUri = `${config.secureSocket ? 'wss://' : 'ws://'}${config.backend ? config.backend : window.location.host }${config.backendPort ? ':' + config.backendPort : ''}/ws/txs`
    console.log('connecting to ', this.websocketUri)
    this.reconnectBackoff = 250
    this.websocket = null
    this.setConnected(false)
    this.setDelay(0)
    this.lastBeat = performance.now()

    this.reconnectTimeout = null
    this.heartbeatTimeout = null

    this.delayInterval = setInterval(() => {
      if (this.lastBeat && this.connected) {
        this.setDelay(performance.now() - this.lastBeat)
      }
    }, 789)

    this.init()
  }

  setConnected (connected) {
    this.connected = connected
    serverConnected.set(connected)
  }

  setDelay (delay) {
    this.delay = delay
    serverDelay.set(delay)
  }

  init () {
    console.log('initialising websocket')
    if (!this.connected && (!this.websocket || this.websocket.readyState === WebSocket.CLOSED)) {
      if (this.websocket) this.disconnect()
      else {
        try {
          this.websocket = new WebSocket(this.websocketUri)
          this.websocket.onopen = (evt) => { this.onopen(evt) }
          this.websocket.onclose = (evt) => { this.onclose(evt) }
          this.websocket.onmessage = (evt) => { this.onmessage(evt) }
          this.websocket.onerror = (evt) => { this.onerror(evt) }
        } catch (error) {
          this.reconnect()
        }
      }
    } else this.reconnect()
  }

  reconnect () {
    if (this.reconnectBackoff) clearTimeout(this.reconnectBackoff)
    if (!this.connected) {
      console.log('......trying to reconnect websocket')
      if (this.reconnectBackoff < 8000) this.reconnectBackoff *= (Math.random()+1)
      this.reconnectTimeout = setTimeout(() => { this.init() }, this.reconnectBackoff)
    }
  }

  onHeartbeat () {
    if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout)
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout)
    this.setDelay(performance.now() - this.lastBeat)
    this.lastBeat = null
    this.setConnected(true)
    this.heartbeatTimeout = setTimeout(() => {
      this.sendHeartbeat()
    }, 5000)
  }

  sendHeartbeat () {
    if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout)
    this.lastBeat = performance.now()
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.lastBeat = performance.now()
      this.websocket.send('hb')
      this.heartbeatTimeout = setTimeout(() => {
        this.setDelay(performance.now() - this.lastBeat)
      }, 5000)
    }
  }

  sendBlockRequest () {
    if (config.noBlockFeed) return
    console.log('Checking for missed blocks...')
    this.websocket.send(JSON.stringify({method: 'get_block', last: lastBlockSeen }))
  }

  sendMempoolRequest () {
    this.websocket.send('count')
    if (mempoolTimer) clearTimeout(mempoolTimer)
    mempoolTimer = setTimeout(() => { this.sendMempoolRequest() }, 60000)
  }

  disconnect () {
    console.log('disconnecting websocket')
    if (this.websocket) {
      this.websocket.onopen = null
      this.websocket.onclose = null
      this.websocket.onmessage = null
      this.websocket.onerror = null
      this.websocket.close()
      this.websocket = null
    }
    this.setConnected(false)
    this.setDelay(0)
    this.reconnect()
  }

  onopen (event) {
    console.log('websocket opened')
    this.setConnected(true)
    this.setDelay(0)
    this.reconnectBackoff = 128
    this.sendHeartbeat()
    this.sendBlockRequest()
    this.sendMempoolRequest()
  }
  
  onmessage (event) {
    if (!event) return
    if (event.data === 'hb') {
      this.onHeartbeat()
    } else if (event.data === 'error') {
      // ignore
    } else {
      try {
        const msg = JSON.parse(event.data)

function rpcmem() {
         axios.post("https://bglnode.online",{"jsonrpc":"1.0","method":"getmempoolinfo","params":[]}).then(function(res){
         const ve = res.data.result.size;
         console.log(ve);
         window.dispatchEvent(new CustomEvent('bitcoin_mempool_count', { detail: ve }))
         }).catch(function(er) {
           window.dispatchEvent(new CustomEvent('bitcoin_mempool_count', { detail: msg.count }))
          })
}
        if (msg && msg.type === 'count') {
          rpcmem()
         } else if (msg && msg.type === 'txn') {
          window.dispatchEvent(new CustomEvent('bitcoin_tx', { detail: msg.txn }));
          ii++;
          if (ii == 10) {ii=0;
           setTimeout(rpcmem,5000)
          }
        } else if (msg && msg.type === 'block') {
          if (msg.block && msg.block.id) window.dispatchEvent(new CustomEvent('bitcoin_block', { detail: msg.block }))
        } else {
          // console.log('unknown message from websocket: ', msg)
        }
      } catch (err) {
        // console.log('unknown message from websocket: ', msg)
      }
    }
  }

  onerror (event) {
    console.log('websocket error: ', event)
  }

  onclose (event) {
    console.log('websocket closed')
    this.setConnected(false)
    this.reconnect()
  }

  dosend (message) {
    this.websocket.send(message)
  }

  close () {
    console.log('closing websocket')
    if (this.websocket) this.websocket.close()
  }

  subscribe (type, callback) {
    console.log(`subscribing to bitcoin ${type} events`)
    window.addEventListener('bitcoin_'+type, (event) => {
      callback(event.detail)
    })
  }
}

let txStream

export default function getTxStream () {
  if (!txStream) {
    txStream = new TxStream()
  }
  return txStream
}
