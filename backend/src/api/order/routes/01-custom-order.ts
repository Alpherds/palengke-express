import type { Core } from '@strapi/strapi'

const routes: Core.RouterConfig = {
  type: 'content-api',

  routes: [
    {
      method: 'POST',
      path: '/orders/submit',
      handler: 'api::order.order.submit',

      config: {
        auth: false,
      },
    },
  ],
}

export default routes