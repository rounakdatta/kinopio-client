// client → [broadcast] → websocket → server

let reconnectAttempts = 0

const self = {
  namespaced: true,
  // triggers websocket
  mutations: {
    connect: () => {},
    reconnect: () => {},
    joinSpaceRoom: () => {},
    update: () => {},
    close: () => {}

    // offscreen user indication (moons?)
    // from offline to online: .. When you come back online, the client downloads a fresh copy of the document, reconnects to websocket
  },
  actions: {
    reconnect: (context) => {
      setTimeout(() => {
        context.commit('reconnect')
        reconnectAttempts += 1
      }, Math.min(5000 * reconnectAttempts), 60 * 1000)
    }
  }
}

export default self
