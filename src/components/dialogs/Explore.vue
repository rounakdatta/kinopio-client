<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, onUnmounted, defineProps, defineEmits, watch, ref, nextTick } from 'vue'
import { useStore } from 'vuex'

import SpaceList from '@/components/SpaceList.vue'
import Loader from '@/components/Loader.vue'
import UserLabelInline from '@/components/UserLabelInline.vue'
import utils from '@/utils.js'
import OfflineBadge from '@/components/OfflineBadge.vue'

import randomColor from 'randomcolor'

const store = useStore()

const dialogElement = ref(null)
const resultsElement = ref(null)

onMounted(() => {
  store.subscribe((mutation, state) => {
    if (mutation.type === 'updatePageSizes') {
      updateHeights()
    }
  })
})

const props = defineProps({
  visible: Boolean,
  spaces: Object,
  exploreSpaces: Object,
  followingSpaces: Object,
  everyoneSpaces: Object,
  loading: Boolean,
  unreadExploreSpacesCount: Number,
  unreadFollowingSpacesCount: Number,
  unreadEveryoneSpacesCount: Number,
  errorIsLoading: Boolean
})
watch(() => props.visible, (value, prevValue) => {
  store.commit('clearNotificationsWithPosition')
  if (value) {
    updateHeights()
    updateUserShowInExploreUpdatedAt()
    store.commit('shouldExplicitlyHideFooter', true)
  } else {
    store.commit('shouldExplicitlyHideFooter', false)
  }
})

const state = reactive({
  dialogHeight: null,
  resultsSectionHeight: null,
  userShowInExploreDate: null,
  filteredSpaces: undefined,
  currentSection: 'explore', // 'explore', 'following', 'everyone'
  isReadSections: [], // 'explore', 'following', 'everyone'
  readSpaceIds: []
})

const currentSpace = computed(() => store.state.currentSpace)
const changeSpace = (space) => {
  closeDialogs()
  store.dispatch('currentSpace/changeSpace', space)
  state.readSpaceIds.push(space.id)
}
const closeDialogs = () => {
  // state.exploreRssFeedsIsVisible = false
}
const refreshBrowser = () => {
  window.location.reload()
}

// update height

const parentDialog = computed(() => 'explore')
const updateHeights = async () => {
  await nextTick()
  updateDialogHeight()
  updateResultsSectionHeight()
}
const updateDialogHeight = async () => {
  if (!props.visible) { return }
  await nextTick()
  let element = dialogElement.value
  state.dialogHeight = utils.elementHeight(element)
}
const updateResultsSectionHeight = async () => {
  if (!props.visible) { return }
  await nextTick()
  let element = resultsElement.value
  state.resultsSectionHeight = utils.elementHeight(element, true)
}

// unread sections

watch(() => state.currentSection, (value, prevValue) => {
  state.isReadSections.push(prevValue)
})
const isUnreadExplore = computed(() => {
  if (state.isReadSections.includes('explore')) {
    return false
  }
  return Boolean(props.unreadExploreSpacesCount)
})
const isUnreadFollowing = computed(() => {
  if (state.isReadSections.includes('following')) {
    return false
  }
  return Boolean(props.unreadFollowingSpacesCount)
})
const isUnreadEveryone = computed(() => {
  if (state.isReadSections.includes('everyone')) {
    return false
  }
  return Boolean(props.unreadEveryoneSpacesCount)
})

// current section

const updateCurrentSection = (value) => {
  state.currentSection = value
  updateHeights()
}
const currentSectionIsExplore = computed(() => state.currentSection === 'explore')
const currentSectionIsFollowing = computed(() => state.currentSection === 'following')
const currentSectionIsEveryone = computed(() => state.currentSection === 'everyone')
const currentSpaces = computed(() => {
  let spaces
  if (currentSectionIsExplore.value) {
    spaces = props.exploreSpaces
  } else if (currentSectionIsFollowing.value) {
    spaces = props.followingSpaces
  } else if (currentSectionIsEveryone.value) {
    spaces = props.everyoneSpaces
  }
  return spaces || []
})

// explore spaces

const currentSpaceInExplore = computed(() => currentSpace.value.showInExplore)
const updateUserShowInExploreUpdatedAt = async () => {
  state.userShowInExploreDate = store.state.currentUser.showInExploreUpdatedAt
  let serverDate = await store.dispatch('api/getDate')
  serverDate = serverDate.date
  store.dispatch('currentUser/showInExploreUpdatedAt', serverDate)
}

// blank slate info

const followUsersInfoIsVisible = computed(() => {
  const isFavoriteUsers = Boolean(store.state.currentUser.favoriteUsers.length)
  return !props.loading && !isFavoriteUsers && currentSectionIsFollowing.value
})
const randomUser = computed(() => {
  const luminosity = store.state.currentUser.theme
  const color = randomColor({ luminosity })
  return { color, id: '123' }
})

</script>

<template lang="pug">
dialog.explore.wide(v-if="visible" :open="visible" ref="dialogElement" :style="{'max-height': state.dialogHeight + 'px'}" @click.left.stop='closeDialogs')
  section(v-if="visible" :open="visible")
    .row.title-row
      .segmented-buttons
        button(:class="{active: currentSectionIsExplore}" @click="updateCurrentSection('explore')")
          img.icon.sunglasses(src="@/assets/sunglasses.svg")
          span Explore
          .badge.new-unread-badge.notification-button-badge(v-if="isUnreadExplore")
        button(:class="{active: currentSectionIsFollowing}" @click="updateCurrentSection('following')")
          span Following
          .badge.new-unread-badge.notification-button-badge(v-if="isUnreadFollowing")
        button(:class="{active: currentSectionIsEveryone}" @click="updateCurrentSection('everyone')")
          span Everyone
          .badge.new-unread-badge.notification-button-badge(v-if="isUnreadEveryone")
    OfflineBadge
    .row(v-if="props.loading")
      Loader(:isSmall="true" :visible="props.loading")
    .row(v-if="props.errorIsLoading")
      .badge.danger
        p (シ_ _)シ Something went wrong, Please try again or contact support
        .button-wrap
          button(@click.left="refreshBrowser")
            img.refresh.icon(src="@/assets/refresh.svg")
            span Refresh

    //- follow users blank slate
    section.subsection(v-if="followUsersInfoIsVisible")
      p Follow other people to see their latest updates here
      p.badge.secondary
        UserLabelInline(:user="randomUser" :isClickable="false" :key="randomUser.id" :isSmall="true" :hideYouLabel="true")
        span → Follow

  hr

  section.results-section(ref="resultsElement" :style="{'max-height': state.resultsSectionHeight + 'px'}")
    SpaceList(
      :spaces="currentSpaces"
      :showUser="true"
      @selectSpace="changeSpace"
      :userShowInExploreDate="state.userShowInExploreDate"
      :readSpaceIds="state.readSpaceIds"
      :spaceReadDateType="state.currentSection"
      :resultsSectionHeight="state.resultsSectionHeight"
      :parentDialog="parentDialog"
      :previewImageIsWide="true"
      :hideFilter="true"
      :showCollaborators="true"
    )
</template>

<style lang="stylus">
dialog.explore
  left initial
  right -35px
  overflow auto
  // &.wide
  //   width 330px
  .loader
    margin-right 5px
    vertical-align -2px
  .segmented-buttons
    button
      position relative
  hr
    margin-top 0
  .badge
    .button-wrap:last-child
      margin-bottom 4px
</style>
