import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../pages/Dashboard.vue'
import TicketsByGroup from '../pages/TicketsByGroup.vue'
import UnacknowledgedTickets from '../pages/UnacknowledgedTickets.vue'
import Satisfaction from '../pages/Satisfaction.vue'
import DashboardPrint from '../pages/DashboardPrint.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',               component: Dashboard },
    { path: '/tickets',        component: TicketsByGroup },
    { path: '/unacknowledged', component: UnacknowledgedTickets },
    { path: '/satisfaction',   component: Satisfaction },
    // Chrome-free single-dashboard view, driven by a headless browser to
    // capture a screenshot + tabular data for emails (see dashboard-render/render_dashboard.py).
    { path: '/print/:dashboardId', component: DashboardPrint, meta: { bare: true } },
  ],
})
