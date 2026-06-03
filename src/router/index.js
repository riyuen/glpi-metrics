import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../pages/Dashboard.vue'
import TicketsByGroup from '../pages/TicketsByGroup.vue'
import UnacknowledgedTickets from '../pages/UnacknowledgedTickets.vue'
import Satisfaction from '../pages/Satisfaction.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',               component: Dashboard },
    { path: '/tickets',        component: TicketsByGroup },
    { path: '/unacknowledged', component: UnacknowledgedTickets },
    { path: '/satisfaction',   component: Satisfaction },
  ],
})
