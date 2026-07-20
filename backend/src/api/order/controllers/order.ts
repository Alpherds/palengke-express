import { factories } from '@strapi/strapi'
import { randomUUID } from 'node:crypto'

/**
 * Generates an order code such as:
 * PLX-20260720-A1B2C3D4
 */
function generateOrderCode(): string {
  const now = new Date()

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  const reference = randomUUID()
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase()

  return `PLX-${year}${month}${day}-${reference}`
}

/**
 * Converts:
 * +639171234567
 * 0917 123 4567
 * 0917-123-4567
 *
 * Into:
 * 09171234567
 */
function normalizeContactNumber(value: unknown): string {
  let contactNumber = String(value ?? '')
    .trim()
    .replace(/[\s()-]/g, '')

  if (contactNumber.startsWith('+63')) {
    contactNumber = `0${contactNumber.slice(3)}`
  }

  return contactNumber
}

export default factories.createCoreController(
  'api::order.order',

  ({ strapi }) => ({
    async submit(ctx) {
      try {
        const body = (ctx.request.body ?? {}) as Record<string, unknown>

        const customerName = String(
          body.customer_name ?? '',
        ).trim()

        const contactNumber = normalizeContactNumber(
          body.contact_number,
        )

        const productDocumentId = String(
          body.product_document_id ?? '',
        ).trim()

        const quantity = Number(body.quantity)

        /*
        |--------------------------------------------------------------------------
        | Validate customer information
        |--------------------------------------------------------------------------
        */

        if (
          customerName.length < 2
          || customerName.length > 100
        ) {
          return ctx.badRequest(
            'Maglagay ng wastong pangalan.',
          )
        }

        if (!/^09\d{9}$/.test(contactNumber)) {
          return ctx.badRequest(
            'Maglagay ng wastong Philippine mobile number.',
          )
        }

        /*
        |--------------------------------------------------------------------------
        | Validate quantity
        |--------------------------------------------------------------------------
        */

        if (
          !Number.isInteger(quantity)
          || quantity < 1
          || quantity > 100
        ) {
          return ctx.badRequest(
            'Ang quantity ay dapat mula 1 hanggang 100.',
          )
        }

        if (!productDocumentId) {
          return ctx.badRequest(
            'Kailangan pumili ng produkto.',
          )
        }

        /*
        |--------------------------------------------------------------------------
        | Retrieve the published product
        |--------------------------------------------------------------------------
        */

        const product = await strapi
          .documents('api::product.product')
          .findOne({
            documentId: productDocumentId,
            status: 'published',
          })

        if (!product || !product.is_active) {
          return ctx.notFound(
            'Hindi available ang napiling produkto.',
          )
        }

        /*
        |--------------------------------------------------------------------------
        | Calculate the total on the server
        |--------------------------------------------------------------------------
        */

        const productPrice = Number(product.price)

        if (
          !Number.isFinite(productPrice)
          || productPrice < 0
        ) {
          return ctx.internalServerError(
            'Invalid ang presyo ng produkto.',
          )
        }

        const totalAmount = Number(
          (productPrice * quantity).toFixed(2),
        )

        const orderCode = generateOrderCode()

        /*
        |--------------------------------------------------------------------------
        | Save the order
        |--------------------------------------------------------------------------
        */

        const orderData = {
          order_code: orderCode,
          customer_name: customerName,
          contact_number: contactNumber,
          quantity,
          total_amount: totalAmount,
          order_status: 'pending',

          // Order belongs to this product
          product: product.documentId,
        } as any

        const order = await strapi
          .documents('api::order.order')
          .create({
            data: orderData,
          })

        /*
        |--------------------------------------------------------------------------
        | Return safe customer-facing information
        |--------------------------------------------------------------------------
        */

        ctx.status = 201

        ctx.body = {
          data: {
            documentId: order.documentId,
            order_code: orderCode,
            customer_name: customerName,
            contact_number: contactNumber,
            quantity,
            total_amount: totalAmount,
            order_status: 'pending',

            product: {
              documentId: product.documentId,
              product_name: product.product_name,
              price: productPrice,
              unit: product.unit,
            },
          },
        }
      } catch (error) {
        strapi.log.error('Order submission failed:', error)

        return ctx.internalServerError(
          'Hindi naisumite ang order. Subukan muli.',
        )
      }
    },
  }),
)