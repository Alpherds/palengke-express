import { factories } from '@strapi/strapi'
import { randomUUID } from 'node:crypto'

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const MAX_ORDER_QUANTITY = 100

/*
|--------------------------------------------------------------------------
| Custom request error
|--------------------------------------------------------------------------
*/

class OrderRequestError extends Error {
  status: 400 | 404

  constructor(status: 400 | 404, message: string) {
    super(message)

    this.name = 'OrderRequestError'
    this.status = status
  }
}

/*
|--------------------------------------------------------------------------
| Generate order code
|--------------------------------------------------------------------------
|
| Example:
| PLX-20260720-A1B2C3D4
|
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

/*
|--------------------------------------------------------------------------
| Normalize Philippine contact number
|--------------------------------------------------------------------------
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

/*
|--------------------------------------------------------------------------
| Order controller
|--------------------------------------------------------------------------
*/

export default factories.createCoreController(
  'api::order.order',

  ({ strapi }) => ({
    async submit(ctx) {
      try {
        const body = (ctx.request.body ?? {}) as Record<
          string,
          unknown
        >

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
        | Validate customer name
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

        /*
        |--------------------------------------------------------------------------
        | Validate Philippine mobile number
        |--------------------------------------------------------------------------
        */

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
          || quantity > MAX_ORDER_QUANTITY
        ) {
          return ctx.badRequest(
            `Ang quantity ay dapat mula 1 hanggang ${MAX_ORDER_QUANTITY}.`,
          )
        }

        /*
        |--------------------------------------------------------------------------
        | Validate product documentId
        |--------------------------------------------------------------------------
        */

        if (!productDocumentId) {
          return ctx.badRequest(
            'Kailangan pumili ng produkto.',
          )
        }

        const orderCode = generateOrderCode()

        /*
        |--------------------------------------------------------------------------
        | Transaction
        |--------------------------------------------------------------------------
        |
        | Both operations must succeed:
        |
        | 1. Create the order
        | 2. Deduct product stock
        |
        */

        const result = await strapi.db.transaction(
          async () => {
            /*
            |--------------------------------------------------------------------------
            | Get the current product
            |--------------------------------------------------------------------------
            */

            const product = await strapi
              .documents('api::product.product')
              .findOne({
                documentId: productDocumentId,
              })

            if (!product) {
              throw new OrderRequestError(
                404,
                'Hindi makita ang napiling produkto.',
              )
            }

            if (!product.is_active) {
              throw new OrderRequestError(
                400,
                'Kasalukuyang hindi available ang produktong ito.',
              )
            }

            /*
            |--------------------------------------------------------------------------
            | Check the stored product price
            |--------------------------------------------------------------------------
            */

            const productPrice = Number(product.price)

            if (
              !Number.isFinite(productPrice)
              || productPrice < 0
            ) {
              throw new Error(
                'Invalid ang presyo ng produkto.',
              )
            }

            /*
            |--------------------------------------------------------------------------
            | Check current stock
            |--------------------------------------------------------------------------
            */

            const currentStock = Math.max(
              0,
              Math.floor(Number(product.quantity) || 0),
            )

            if (currentStock < 1) {
              throw new OrderRequestError(
                400,
                'Ubos na ang stock ng produktong ito.',
              )
            }

            if (quantity > currentStock) {
              throw new OrderRequestError(
                400,
                `Hindi sapat ang stock. ${currentStock} na lamang ang available.`,
              )
            }

            /*
            |--------------------------------------------------------------------------
            | Calculate total and remaining stock
            |--------------------------------------------------------------------------
            */

            const totalAmount = Number(
              (productPrice * quantity).toFixed(2),
            )

            const remainingStock = currentStock - quantity

            /*
            |--------------------------------------------------------------------------
            | Create the order
            |--------------------------------------------------------------------------
            */

            const orderData = {
              order_code: orderCode,
              customer_name: customerName,
              contact_number: contactNumber,
              quantity,
              total_amount: totalAmount,

              // Many-to-one relation using documentId
              product: product.documentId,
            } as any

            const order = await strapi
              .documents('api::order.order')
              .create({
                // Order has Draft & Publish enabled
                status: 'published',

                data: orderData,
              })

            /*
            |--------------------------------------------------------------------------
            | Deduct product stock
            |--------------------------------------------------------------------------
            */

            await strapi
              .documents('api::product.product')
              .update({
                documentId: product.documentId,

                data: {
                  quantity: remainingStock,
                } as any,
              })

            return {
              order,
              product,
              productPrice,
              totalAmount,
              remainingStock,
            }
          },
        )

        /*
        |--------------------------------------------------------------------------
        | Customer-facing response
        |--------------------------------------------------------------------------
        */

        ctx.status = 201

        ctx.body = {
          data: {
            documentId: result.order.documentId,
            order_code: orderCode,
            customer_name: customerName,
            contact_number: contactNumber,
            quantity,
            total_amount: result.totalAmount,
            remaining_stock: result.remainingStock,

            product: {
              documentId: result.product.documentId,
              product_name: result.product.product_name,
              price: result.productPrice,
              unit: result.product.unit,
            },
          },
        }
      } catch (error) {
        if (error instanceof OrderRequestError) {
          if (error.status === 404) {
            return ctx.notFound(error.message)
          }

          return ctx.badRequest(error.message)
        }

        strapi.log.error(
          'Order submission failed:',
          error,
        )

        return ctx.internalServerError(
          'Hindi naisumite ang order. Subukan muli.',
        )
      }
    },
  }),
)