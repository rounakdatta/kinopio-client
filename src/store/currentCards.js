import utils from '@/utils.js'
import cache from '@/cache.js'

import nanoid from 'nanoid'
import uniqBy from 'lodash-es/uniqBy'

// import debounce from 'lodash-es/debounce'

// normalized state
// https://github.com/vuejs/vuejs.org/issues/1636
let currentSpaceId

export default {
  namespaced: true,
  state: {
    ids: [],
    cards: {},
    removedCards: [], // denormalized
    cardMap: []
  },
  mutations: {

    // init

    clear: (state) => {
      state.ids = []
      state.cards = {}
      state.removedCards = []
      state.cardMap = []
    },
    restore: (state, cards) => {
      let cardIds = []
      cards.forEach(card => {
        cardIds.push(card.id)
        state.cards[card.id] = card
      })
      state.ids = state.ids.concat(cardIds)
    },

    // create

    create: (state, card) => {
      state.ids.push(card.id)
      state.cards[card.id] = card
      cache.updateSpace('cards', state.cards, currentSpaceId)
    },

    // update

    update: (state, card) => {
      if (card.x) {
        card.x = Math.round(card.x)
      }
      if (card.y) {
        card.y = Math.round(card.y)
      }
      const keys = Object.keys(card)
      keys.forEach(key => {
        state.cards[card.id][key] = card[key]
      })
      cache.updateSpaceCardsDebounced(state.cards, currentSpaceId)
    },
    move: (state, { cards, delta, spaceId }) => {
      cards.forEach(card => {
        state.cards[card.id].x = card.x + delta.x
        state.cards[card.id].y = card.y + delta.y
      })
      cache.updateSpaceCardsDebounced(state.cards, currentSpaceId)
    },

    // remove

    remove: (state, cardToRemove) => {
      const card = state.cards[cardToRemove.id]
      state.ids = state.ids.filter(id => id !== card.id)
      delete state.cards[card.id]
      state.removedCards.unshift(card)
      cache.updateSpace('removedCards', state.removedCards, currentSpaceId)
      cache.updateSpace('cards', state.cards, currentSpaceId)
    },
    removedCards: (state, removedCards) => {
      state.removedCards = removedCards
    },
    removePermanent: (state, cardToRemove) => {
      const card = state.cards[cardToRemove.id]
      state.ids = state.ids.filter(id => id !== card.id)
      delete state.cards[card.id]
      // state.cards = state.cards.filter(id => id !== card.id)
      const isRemoved = state.removedCards.find(removedCard => card.id === removedCard.id)
      if (isRemoved) {
        state.removedCards = state.removedCards.filter(removedCard => card.id !== removedCard.id)
        cache.updateSpace('removedCards', state.removedCards, currentSpaceId)
      } else {
        cache.updateSpace('cards', state.cards, currentSpaceId)
      }
    },
    removeAllRemovedPermanent: (state) => {
      state.removedCards = []
      cache.updateSpace('removedCards', state.removedCards, currentSpaceId)
    },
    restoreRemovedCard: (state, cardToRestore) => {
      let card = state.cards[cardToRestore.id]
      const index = state.removedCards.findIndex(removedCard => card.id === removedCard.id)
      // restore
      state.ids.push(card.id)
      card = utils.normalizeItems(card)
      state.cards[card.id] = card
      cache.updateSpace('cards', state.cards, currentSpaceId)
      // update removed
      state.removedCards.splice(index, 1)
      cache.updateSpace('removedCards', state.removedCards, currentSpaceId)
    },

    // broadcast

    moveBroadcast: (state, { cards, delta }) => {
      cards.forEach(updated => {
        const card = state.cards[updated.id]
        if (!card) { return }
        card.x = updated.x
        card.y = updated.y
      })
      cache.updateSpace('cards', state.cards, currentSpaceId)
    },

    // card map

    cardMap: (state, cardMap) => {
      utils.typeCheck({ value: cardMap, type: 'array', origin: 'cardMap' })
      state.cardMap = cardMap
    },
    addToCardMap: (state, card) => {
      state.cardMap.push(card)
    },
    removeFromCardMap: (state, card) => {
      state.cardMap = state.cardMap.filter(prevCard => prevCard.id !== card.id)
    },
    updateCardInCardMap: (state, card) => {
      state.cardMap = state.cardMap.map(prevCard => {
        if (prevCard.id === card.id) {
          return card
        }
        return prevCard
      })
    }

  },
  actions: {

    // init

    updateSpaceId: (context, spaceId) => {
      currentSpaceId = spaceId
    },

    // create

    add: (context, { position, isParentCard, name, id }) => {
      utils.typeCheck({ value: position, type: 'object', origin: 'addCard' })
      if (context.rootGetters['currentSpace/shouldPreventAddCard']) {
        context.commit('notifyCardsCreatedIsOverLimit', true, { root: true })
        return
      }

      let cards = context.getters.all
      const highestCardZ = utils.highestCardZ(cards)
      let card = {
        id: id || nanoid(),
        x: position.x,
        y: position.y,
        z: highestCardZ + 1,
        name: name || '',
        frameId: 0,
        userId: context.rootState.currentUser.id,
        urlPreviewIsVisible: true,
        commentIsVisible: true,
        width: utils.emptyCard().width,
        height: utils.emptyCard().height
      }
      context.commit('cardDetailsIsVisibleForCardId', card.id, { root: true })
      context.commit('create', card)

      card.spaceId = currentSpaceId
      const update = { name: 'createCard', action: 'currentCards/add', body: card }
      context.dispatch('api/addToQueue', update, { root: true })
      context.dispatch('broadcast/update', { updates: card, type: 'createCard' }, { root: true })

      if (isParentCard) { context.commit('parentCardId', card.id, { root: true }) }
      context.dispatch('currentUser/cardsCreatedCountUpdateBy', {
        delta: 1
      }, { root: true })
      context.dispatch('currentSpace/checkIfShouldNotifyCardsCreatedIsNearLimit', null, { root: true })
      context.dispatch('currentSpace/notifyCollaboratorsCardUpdated', { cardId: id, type: 'createCard' }, { root: true })
      context.commit('addToCardMap', card)
    },
    addMultiple: (context, newCards) => {
      newCards.forEach(card => {
        card = {
          id: card.id || nanoid(),
          x: card.x,
          y: card.y,
          z: card.z || context.state.ids.length + 1,
          name: card.name,
          frameId: card.frameId || 0,
          userId: context.rootState.currentUser.id
        }
        context.commit('createCard', card)
        context.dispatch('api/addToQueue', { name: 'createCard', body: card }, { root: true })
        context.dispatch('broadcast/update', { updates: card, type: 'createCard', action: 'currentCards/addMultiple' }, { root: true })
        context.commit('addToCardMap', 'card')
      })
    },
    paste: (context, { card, cardId }) => {
      utils.typeCheck({ value: card, type: 'object', origin: 'pasteCard' })
      card.id = cardId || nanoid()
      card.spaceId = currentSpaceId
      const prevCards = context.getters.all
      utils.uniqueCardPosition(card, prevCards)
      const tags = utils.tagsFromStringWithoutBrackets(card.name)
      if (tags) {
        tags.forEach(tag => {
          tag = utils.newTag({
            name: tag,
            defaultColor: context.rootState.currentUser.color,
            cardId: card.id,
            spaceId: context.state.id
          })
          context.dispatch('currentSpace/addTag', tag, { root: true }) // TODO to tag module?
        })
      }
      context.commit('create', card)
      context.dispatch('api/addToQueue', { name: 'createCard', body: card }, { root: true })
      context.dispatch('broadcast/update', { updates: card, type: 'createCard', action: 'currentCards/paste' }, { root: true })
      context.dispatch('currentUser/cardsCreatedCountUpdateBy', {
        delta: 1
      }, { root: true })
      context.commit('addToCardMap', card)
    },

    // update

    update: (context, card) => {
      // prevent null position
      const keys = Object.keys(card)
      if (keys.includes('x') || keys.includes('y')) {
        if (!card.x) {
          delete card.x
        }
        if (!card.y) {
          delete card.y
        }
      }
      context.commit('update', card)
      context.dispatch('api/addToQueue', { name: 'updateCard', body: card }, { root: true })
      context.dispatch('broadcast/update', { updates: card, type: 'updateCard', action: 'currentCards/update' }, { root: true })
    },
    replaceInName: (context, { cardId, match, replace }) => {
      const card = context.getters.byId(cardId)
      const name = card.name.replace(match, replace)
      context.dispatch('update', {
        id: cardId,
        name
      })
    },
    updateDimensions: (context) => {
      let cards = context.getters.all
      cards.forEach(card => {
        const prevDimensions = {
          width: card.width,
          height: card.height
        }
        card = utils.updateCardDimentions(card)
        const dimensionsChanged = card.width !== prevDimensions.width || card.height !== prevDimensions.height
        if (!dimensionsChanged) { return }
        const body = {
          id: card.id,
          width: Math.ceil(card.width),
          height: Math.ceil(card.height)
        }
        context.dispatch('api/addToQueue', { name: 'updateCard', body }, { root: true })
        context.dispatch('broadcast/update', { updates: body, type: 'updateCard' }, { root: true })
        context.commit('update', body)
      })
    },
    toggleChecked (context, { cardId, value }) {
      utils.typeCheck({ value, type: 'boolean', origin: 'toggleChecked' })
      utils.typeCheck({ value: cardId, type: 'string', origin: 'toggleChecked' })
      const card = context.getters.byId(cardId)
      let name = card.name
      const checkbox = utils.checkboxFromString(name)
      name = name.replace(checkbox, '')
      if (value) {
        name = `[x] ${name}`
      } else {
        name = `[] ${name}`
      }
      context.dispatch('update', {
        id: cardId,
        name,
        nameUpdatedAt: new Date()
      })
    },
    toggleCommentIsVisible: (context, cardId) => {
      utils.typeCheck({ value: cardId, type: 'string', origin: 'toggleCommentIsVisible' })
      const card = context.getters.byId(cardId)
      const value = !card.commentIsVisible
      context.dispatch('updateCard', {
        id: cardId,
        commentIsVisible: value
      })
    },

    // drag

    drag: (context, { endCursor, prevCursor, delta }) => {
      const spaceId = context.rootState.currentSpace.id
      const currentDraggingCardId = context.rootState.currentDraggingCardId
      const multipleCardsSelectedIds = context.rootState.multipleCardsSelectedIds
      const zoom = context.rootGetters.spaceCounterZoomDecimal
      if (!endCursor || !prevCursor) { return }
      endCursor = {
        x: endCursor.x * zoom,
        y: endCursor.y * zoom
      }
      delta = delta || {
        x: endCursor.x - prevCursor.x,
        y: endCursor.y - prevCursor.y
      }
      let cardIds
      // let connections = []
      if (multipleCardsSelectedIds.length) {
        cardIds = multipleCardsSelectedIds
      } else {
        cardIds = [currentDraggingCardId]
      }

      let cards = cardIds.map(id => context.getters.byId(id))

      // console.log('🔵', cardIds, cards)

      // prevent cards bunching up at 0
      cards.forEach(card => {
        if (card.x === 0) { delta.x = Math.max(0, delta.x) }
        if (card.y === 0) { delta.y = Math.max(0, delta.y) }
        // connections = connections.concat(context.getters.cardConnections(card.id))
        // context.commit('updateCardInCardMap', card)
      })
      // connections = uniqBy(connections, 'id')
      context.commit('move', { cards, delta, spaceId })
      context.commit('cardsWereDragged', true, { root: true })
      // context.commit('currentConnections/updatePaths', connections, { root: true })
      context.dispatch('broadcast/update', { updates: { cards, delta }, type: 'moveCards' }, { root: true })
      // context.dispatch('broadcast/update', { updates: { connections }, type: 'updateConnectionPaths' }, { root: true })
      // connections.forEach(connection => {
      //   context.dispatch('api/addToQueue', { name: 'updateConnection', body: connection }, { root: true })
      // })
    },
    afterDrag: (context) => {
      const currentDraggingCardId = context.rootState.currentDraggingCardId
      const multipleCardsSelectedIds = context.rootState.multipleCardsSelectedIds
      let cards
      let connections = []
      if (multipleCardsSelectedIds.length) {
        cards = multipleCardsSelectedIds
      } else {
        cards = [currentDraggingCardId]
      }
      cards = cards.map(id => context.getters.byId(id))
      cards = cards.filter(card => card)
      cards.forEach(card => {
        const update = { name: 'updateCard',
          body: {
            id: card.id,
            x: card.x,
            y: card.y,
            z: card.z
          }
        }
        context.dispatch('api/addToQueue', update, { root: true })
        connections = connections.concat(context.rootGetters['currentConnections/byCardId'](card.id))
      })
      connections = uniqBy(connections, 'id')
      context.commit('currentConnections/updatePaths', connections, { root: true })
      context.dispatch('broadcast/update', { updates: { connections }, type: 'updateConnectionPaths', action: 'currentCards/dragged' }, { root: true })
    },

    // z-index

    incrementSelectedZs: (context) => {
      const multipleCardsSelectedIds = context.rootState.multipleCardsSelectedIds
      const currentDraggingCardId = context.rootState.currentDraggingCardId
      if (multipleCardsSelectedIds.length) {
        multipleCardsSelectedIds.forEach(id => context.dispatch('incrementZ', id))
      } else {
        context.dispatch('incrementZ', currentDraggingCardId)
      }
    },
    clearAllZs: (context) => {
      let cards = context.getters.all
      cards.forEach(card => {
        const body = { id: card.id, z: 0 }
        const update = { name: 'updateCard', body }
        context.commit('update', body)
        context.dispatch('api/addToQueue', update, { root: true })
        context.dispatch('broadcast/update', { updates: body, type: 'updateCard' }, { root: true })
      })
    },
    incrementZ: (context, id) => {
      const maxInt = Number.MAX_SAFE_INTEGER - 1000
      let cards = context.getters.all
      let highestCardZ = utils.highestCardZ(cards)
      if (highestCardZ > maxInt) {
        context.dispatch('clearAllZs')
        highestCardZ = 1
      }
      const userCanEdit = context.rootGetters['currentUser/canEditSpace']()
      const body = { id, z: highestCardZ + 1 }
      context.commit('update', body)
      if (!userCanEdit) { return }
      const update = { name: 'updateCard', body }
      context.dispatch('api/addToQueue', update, { root: true })
      context.dispatch('broadcast/update', { updates: body, type: 'updateCard' }, { root: true })
    },

    // remove

    remove: (context, card) => {
      const cardHasContent = Boolean(card.name)
      if (cardHasContent) {
        context.commit('remove', card)
        const update = { name: 'removeCard', action: 'currentCards/remove', body: card }
        context.dispatch('api/addToQueue', update, { root: true })
      } else {
        context.dispatch('removePermanent', card)
      }
      context.dispatch('broadcast/update', { updates: card, type: 'removeCard' }, { root: true })
      // context.dispatch('currentConnections/removeFromCard', card)
      context.commit('triggerUpdatePositionInVisualViewport', null, { root: true })
      const cardIsUpdatedByCurrentUser = card.userId === context.rootState.currentUser.id
      if (cardIsUpdatedByCurrentUser) {
        context.dispatch('currentUser/cardsCreatedCountUpdateBy', {
          delta: -1
        }, { root: true })
      }
      if (!context.rootGetters['currentUser/cardsCreatedIsOverLimit']) {
        context.commit('notifyCardsCreatedIsOverLimit', false, { root: true })
      }
      context.commit('currentCards/removeFromCardMap', card, { root: true })
    },
    removePermanent: (context, card) => {
      context.commit('removePermanent', card)
      // context.commit('removeTagsFromCard', card)
      context.dispatch('api/addToQueue', { name: 'removeCardPermanent', body: card }, { root: true })
    },
    removeAllRemovedPermanent: (context) => {
      // context.commit('removeTagsFromAllRemovedCardsPermanent')
      context.commit('removeAllRemovedPermanent')
      context.dispatch('api/addToQueue', { name: 'removeAllRemovedCardsPermanentFromSpace', body: {} }, { root: true })
    },
    restoreRemoved: (context, card) => {
      context.commit('restoreRemovedCard', card)
      const update = { name: 'restoreRemovedCard', action: 'currentCards/restoreRemoved', body: card }
      context.dispatch('api/addToQueue', update, { root: true })
      context.dispatch('broadcast/update', { updates: card, type: 'restoreRemovedCard' }, { root: true })
      context.commit('currentCards/addToCardMap', card, { root: true })
    },

    // card details

    showCardDetails: (context, cardId) => {
      context.dispatch('incrementZ', cardId)
      context.commit('cardDetailsIsVisibleForCardId', cardId, { root: true })
      context.commit('parentCardId', cardId, { root: true })
      context.commit('loadSpaceShowDetailsForCardId', '', { root: true })
    },

    // card map

    refreshCardMap: (context) => {
      const cards = context.getters.all
      const cardMap = cards.filter(card => {
        return utils.isCardInViewport(card)
      })
      context.commit('cardMap', cardMap)
    }
  },
  getters: {
    byId: (state) => (id) => {
      return state.cards[id]
    },
    all: (state) => {
      return state.ids.map(id => state.cards[id])
    },
    withSpaceLinks: (state, getters) => {
      let cards = getters.all
      return cards.filter(card => utils.idIsValid(card.linkToSpaceId))
    },
    withTagName: (state, getters) => (tagName) => {
      let cards = getters.all
      return cards.filter(card => {
        const tags = utils.tagsFromStringWithoutBrackets(card.name)
        if (tags) {
          return tags.includes(tagName)
        }
      })
    }

  }
}
