<script setup lang="ts">
/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

interface ProductImage {
  id: number
  documentId: string
  name: string
  alternativeText: string | null
  url: string
  width: number
  height: number

  formats?: {
    thumbnail?: {
      url: string
    }
  }
}

interface Product {
  id: number
  documentId: string
  product_name: string
  price: number | string
  unit: string
  quantity: number | string | null
  is_active: boolean
  image: ProductImage | null
}

interface ProductsResponse {
  data: Product[]

  meta: {
    pagination: {
      page: number
      pageSize: number
      pageCount: number
      total: number
    }
  }
}

interface SubmittedOrder {
  documentId: string
  order_code: string
  customer_name: string
  contact_number: string
  quantity: number
  total_amount: number
  order_status: string
  remaining_stock: number

  product: {
    documentId: string
    product_name: string
    price: number | string
    unit: string
  }
}

interface SubmitOrderResponse {
  data: SubmittedOrder
}

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const config = useRuntimeConfig()

const MAX_ORDER_QUANTITY = 100

/*
|--------------------------------------------------------------------------
| Load products
|--------------------------------------------------------------------------
*/

const {
  data: response,
  status,
  error,
  refresh,
} = await useFetch<ProductsResponse>(
  '/api/products',
  {
    baseURL: config.public.strapiUrl,

    query: {
      populate: 'image',
      'filters[is_active][$eq]': true,
      sort: 'product_name:asc',
      'pagination[pageSize]': 100,
    },
  },
)

const products = computed(
  () => response.value?.data ?? [],
)

/*
|--------------------------------------------------------------------------
| Product stock helpers
|--------------------------------------------------------------------------
*/

function getAvailableStock(product: Product): number {
  return Math.max(
    0,
    Math.floor(Number(product.quantity) || 0),
  )
}

function getMaximumOrderQuantity(
  product: Product,
): number {
  return Math.min(
    getAvailableStock(product),
    MAX_ORDER_QUANTITY,
  )
}

function isOutOfStock(product: Product): boolean {
  return getAvailableStock(product) < 1
}

/*
|--------------------------------------------------------------------------
| Product quantities
|--------------------------------------------------------------------------
*/

const quantities = reactive<Record<string, number>>({})

function getQuantity(product: Product): number {
  return quantities[product.documentId] ?? 0
}

function increaseQuantity(product: Product) {
  const currentQuantity = getQuantity(product)
  const maximumQuantity =
    getMaximumOrderQuantity(product)

  if (currentQuantity >= maximumQuantity) {
    return
  }

  quantities[product.documentId] =
    currentQuantity + 1
}

function decreaseQuantity(product: Product) {
  const currentQuantity = getQuantity(product)

  if (currentQuantity <= 0) {
    quantities[product.documentId] = 0
    return
  }

  quantities[product.documentId] =
    currentQuantity - 1
}

function getProductTotal(product: Product): number {
  return (
    Number(product.price)
    * getQuantity(product)
  )
}

/*
|--------------------------------------------------------------------------
| Order dialog
|--------------------------------------------------------------------------
*/

const orderDialog = ref(false)
const selectedProduct = ref<Product | null>(null)

const selectedQuantity = computed(() => {
  if (!selectedProduct.value) {
    return 0
  }

  return getQuantity(selectedProduct.value)
})

const selectedTotal = computed(() => {
  if (!selectedProduct.value) {
    return 0
  }

  return getProductTotal(selectedProduct.value)
})

const selectedAvailableStock = computed(() => {
  if (!selectedProduct.value) {
    return 0
  }

  return getAvailableStock(selectedProduct.value)
})

/*
|--------------------------------------------------------------------------
| Customer form
|--------------------------------------------------------------------------
*/

const orderForm = ref<any>(null)

const customerName = ref('')
const contactNumber = ref('')

const submittingOrder = ref(false)
const submitError = ref('')

const customerNameRules = [
  (value: string) =>
    Boolean(value?.trim())
    || 'Kailangan ang pangalan.',

  (value: string) =>
    value?.trim().length >= 2
    || 'Hindi bababa sa dalawang character ang pangalan.',

  (value: string) =>
    value?.trim().length <= 100
    || 'Masyadong mahaba ang pangalan.',
]

function normalizeContactNumber(
  value: string,
): string {
  let number = String(value ?? '')
    .trim()
    .replace(/[\s()-]/g, '')

  if (number.startsWith('+63')) {
    number = `0${number.slice(3)}`
  }

  return number
}

const contactNumberRules = [
  (value: string) =>
    Boolean(value?.trim())
    || 'Kailangan ang contact number.',

  (value: string) =>
    /^09\d{9}$/.test(
      normalizeContactNumber(value),
    )
    || 'Maglagay ng wastong Philippine mobile number.',
]

async function openOrderDialog(product: Product) {
  if (
    isOutOfStock(product)
    || getQuantity(product) < 1
  ) {
    return
  }

  selectedProduct.value = product

  customerName.value = ''
  contactNumber.value = ''
  submitError.value = ''

  orderDialog.value = true

  await nextTick()

  orderForm.value?.resetValidation()
}

function closeOrderDialog() {
  if (submittingOrder.value) {
    return
  }

  orderDialog.value = false
  submitError.value = ''

  orderForm.value?.resetValidation()
}

/*
|--------------------------------------------------------------------------
| Submit order
|--------------------------------------------------------------------------
*/

async function submitOrder() {
  const product = selectedProduct.value

  if (!product) {
    return
  }

  const validation =
    await orderForm.value?.validate()

  if (!validation?.valid) {
    return
  }

  if (selectedQuantity.value < 1) {
    submitError.value =
      'Pumili muna ng quantity.'

    return
  }

  if (
    selectedQuantity.value
    > getAvailableStock(product)
  ) {
    submitError.value =
      'Hindi sapat ang available na stock.'

    return
  }

  submittingOrder.value = true
  submitError.value = ''

  try {
    const response =
      await $fetch<SubmitOrderResponse>(
        '/api/orders/submit',
        {
          baseURL: config.public.strapiUrl,

          method: 'POST',

          body: {
            customer_name:
              customerName.value.trim(),

            contact_number:
              contactNumber.value,

            quantity:
              selectedQuantity.value,

            product_document_id:
              product.documentId,
          },
        },
      )

    submittedOrder.value = response.data

    /*
    |--------------------------------------------------------------------------
    | Update local product stock
    |--------------------------------------------------------------------------
    */

    product.quantity =
      response.data.remaining_stock

    quantities[product.documentId] = 0

    /*
    |--------------------------------------------------------------------------
    | Open success dialog
    |--------------------------------------------------------------------------
    */

    orderDialog.value = false
    successDialog.value = true

    customerName.value = ''
    contactNumber.value = ''

    orderForm.value?.resetValidation()

    /*
    |--------------------------------------------------------------------------
    | Synchronize with Strapi
    |--------------------------------------------------------------------------
    */

    void refresh()
  } catch (error: unknown) {
    const fetchError = error as {
      data?: {
        error?: {
          message?: string
        }
      }

      message?: string
    }

    submitError.value =
      fetchError.data?.error?.message
      || fetchError.message
      || 'Hindi naisumite ang order. Subukan muli.'
  } finally {
    submittingOrder.value = false
  }
}

/*
|--------------------------------------------------------------------------
| Success dialog
|--------------------------------------------------------------------------
*/

const successDialog = ref(false)

const submittedOrder =
  ref<SubmittedOrder | null>(null)

function closeSuccessDialog() {
  successDialog.value = false
  submittedOrder.value = null
  selectedProduct.value = null
}

/*
|--------------------------------------------------------------------------
| Display helpers
|--------------------------------------------------------------------------
*/

function getImageUrl(product: Product): string {
  const imageUrl = product.image?.url

  if (!imageUrl) {
    return ''
  }

  if (
    imageUrl.startsWith('http://')
    || imageUrl.startsWith('https://')
  ) {
    return imageUrl
  }

  return `${config.public.strapiUrl}${imageUrl}`
}

function formatPrice(
  price: number | string,
): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Number(price))
}
</script>

<template>
  <v-app>
    <v-main class="bg-grey-lighten-4">
      <v-container class="py-8">
        <!-- Page header -->
        <div class="mb-8">
          <h1
            class="text-h4 font-weight-bold text-green-darken-4"
          >
            Palengke Express
          </h1>

          <p
            class="text-body-1 text-medium-emphasis mt-2"
          >
            Sariling bili, diretso sa bahay.
          </p>
        </div>

        <h2 class="text-h5 font-weight-bold mb-5">
          Mga Paninda Ngayong Araw
        </h2>

        <!-- Loading -->
        <div
          v-if="status === 'pending'"
          class="d-flex justify-center py-12"
        >
          <v-progress-circular
            color="green-darken-3"
            indeterminate
            size="48"
          />
        </div>

        <!-- Error -->
        <v-alert
          v-else-if="error"
          type="error"
          variant="tonal"
          title="Hindi makuha ang mga produkto"
          class="mb-6"
        >
          Siguraduhing tumatakbo ang Strapi
          backend.

          <template #append>
            <v-btn
              variant="text"
              @click="refresh()"
            >
              Subukan muli
            </v-btn>
          </template>
        </v-alert>

        <!-- Empty -->
        <v-alert
          v-else-if="products.length === 0"
          type="info"
          variant="tonal"
        >
          Wala pang available na produkto.
        </v-alert>

        <!-- Product cards -->
        <v-row v-else>
          <v-col
            v-for="product in products"
            :key="product.documentId"
            cols="12"
            sm="6"
            md="4"
            lg="3"
          >
            <v-card
              rounded="lg"
              elevation="2"
              height="100%"
              class="d-flex flex-column"
            >
              <!-- Product image -->
              <div class="position-relative">
                <v-img
                  :src="getImageUrl(product)"
                  :alt="
                    product.image?.alternativeText
                      || product.product_name
                  "
                  height="210"
                  contain
                  class="bg-white"
                >
                  <template #placeholder>
                    <div
                      class="d-flex align-center justify-center fill-height"
                    >
                      <v-progress-circular
                        indeterminate
                      />
                    </div>
                  </template>
                </v-img>

                <v-chip
                  v-if="isOutOfStock(product)"
                  color="red-darken-2"
                  variant="flat"
                  size="small"
                  class="stock-badge"
                >
                  Ubos na
                </v-chip>
              </div>

              <v-card-item>
                <v-card-title
                  class="text-subtitle-1 font-weight-bold"
                >
                  {{ product.product_name }}
                </v-card-title>

                <v-card-subtitle>
                  Presyo kada {{ product.unit }}
                </v-card-subtitle>
              </v-card-item>

              <v-card-text class="flex-grow-1">
                <!-- Price -->
                <div
                  class="text-h6 font-weight-bold text-green-darken-3 mb-2"
                >
                  {{ formatPrice(product.price) }}
                </div>

                <!-- Stock -->
                <div
                  class="d-flex justify-space-between align-center mb-4"
                >
                  <span
                    class="text-caption text-medium-emphasis"
                  >
                    Available stock
                  </span>

                  <v-chip
                    :color="
                      isOutOfStock(product)
                        ? 'red'
                        : 'green'
                    "
                    variant="tonal"
                    size="small"
                  >
                    {{ getAvailableStock(product) }}
                    {{ product.unit }}
                  </v-chip>
                </div>

                <!-- Quantity -->
                <div
                  class="text-caption text-medium-emphasis mb-2"
                >
                  Dami
                </div>

                <div
                  class="d-flex align-center ga-2 mb-4"
                >
                  <v-btn
                    size="small"
                    variant="outlined"
                    min-width="40"
                    :disabled="
                      getQuantity(product) === 0
                      || isOutOfStock(product)
                    "
                    @click="
                      decreaseQuantity(product)
                    "
                  >
                    −
                  </v-btn>

                  <div
                    class="quantity-display d-flex align-center justify-center"
                  >
                    {{ getQuantity(product) }}
                  </div>

                  <v-btn
                    size="small"
                    color="green-darken-3"
                    variant="outlined"
                    min-width="40"
                    :disabled="
                      isOutOfStock(product)
                      || getQuantity(product)
                        >= getMaximumOrderQuantity(product)
                    "
                    @click="
                      increaseQuantity(product)
                    "
                  >
                    +
                  </v-btn>
                </div>

                <!-- Total -->
                <div
                  class="d-flex justify-space-between align-center"
                >
                  <span
                    class="text-body-2 text-medium-emphasis"
                  >
                    Kabuuan
                  </span>

                  <span class="font-weight-bold">
                    {{
                      formatPrice(
                        getProductTotal(product),
                      )
                    }}
                  </span>
                </div>
              </v-card-text>

              <v-card-actions class="pa-3 pt-0">
                <v-btn
                  color="green-darken-3"
                  variant="flat"
                  block
                  :disabled="
                    isOutOfStock(product)
                    || getQuantity(product) < 1
                  "
                  @click="openOrderDialog(product)"
                >
                  {{
                    isOutOfStock(product)
                      ? 'Walang Stock'
                      : 'Umorder'
                  }}
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-container>

      <!-- Order dialog -->
      <v-dialog
        v-model="orderDialog"
        max-width="500"
        persistent
      >
        <v-card rounded="lg">
          <v-card-title
            class="d-flex align-center justify-space-between"
          >
            <span>Kumpirmahin ang Order</span>

            <v-btn
              icon="mdi-close"
              variant="text"
              :disabled="submittingOrder"
              @click="closeOrderDialog"
            />
          </v-card-title>

          <v-divider />

          <template v-if="selectedProduct">
            <v-img
              :src="getImageUrl(selectedProduct)"
              :alt="selectedProduct.product_name"
              height="220"
              contain
              class="bg-white"
            />

            <v-form
              ref="orderForm"
              @submit.prevent="submitOrder"
            >
              <v-card-text>
                <h3
                  class="text-h6 font-weight-bold mb-1"
                >
                  {{ selectedProduct.product_name }}
                </h3>

                <p
                  class="text-body-2 text-medium-emphasis mb-4"
                >
                  {{
                    formatPrice(
                      selectedProduct.price,
                    )
                  }}
                  kada {{ selectedProduct.unit }}
                </p>

                <v-list
                  density="compact"
                  class="pa-0 mb-5"
                >
                  <v-list-item class="px-0">
                    <v-list-item-title>
                      Available stock
                    </v-list-item-title>

                    <template #append>
                      <strong>
                        {{ selectedAvailableStock }}
                        {{ selectedProduct.unit }}
                      </strong>
                    </template>
                  </v-list-item>

                  <v-list-item class="px-0">
                    <v-list-item-title>
                      Dami
                    </v-list-item-title>

                    <template #append>
                      <strong>
                        {{ selectedQuantity }}
                        {{ selectedProduct.unit }}
                      </strong>
                    </template>
                  </v-list-item>

                  <v-list-item class="px-0">
                    <v-list-item-title>
                      Kabuuang halaga
                    </v-list-item-title>

                    <template #append>
                      <strong
                        class="text-green-darken-3"
                      >
                        {{
                          formatPrice(
                            selectedTotal,
                          )
                        }}
                      </strong>
                    </template>
                  </v-list-item>
                </v-list>

                <v-text-field
                  v-model="customerName"
                  label="Pangalan"
                  placeholder="Juan Dela Cruz"
                  variant="outlined"
                  prepend-inner-icon="mdi-account-outline"
                  autocomplete="name"
                  maxlength="100"
                  :rules="customerNameRules"
                  :disabled="submittingOrder"
                  class="mb-2"
                />

                <v-text-field
                  v-model="contactNumber"
                  label="Contact Number"
                  placeholder="09171234567"
                  variant="outlined"
                  prepend-inner-icon="mdi-phone-outline"
                  autocomplete="tel"
                  inputmode="tel"
                  maxlength="16"
                  :rules="contactNumberRules"
                  :disabled="submittingOrder"
                />

                <v-alert
                  v-if="submitError"
                  type="error"
                  variant="tonal"
                  density="compact"
                  class="mt-2"
                >
                  {{ submitError }}
                </v-alert>
              </v-card-text>

              <v-card-actions class="pa-4 pt-0">
                <v-btn
                  variant="outlined"
                  :disabled="submittingOrder"
                  @click="closeOrderDialog"
                >
                  Bumalik
                </v-btn>

                <v-spacer />

                <v-btn
                  type="submit"
                  color="green-darken-3"
                  variant="flat"
                  :loading="submittingOrder"
                >
                  Isumite ang Order
                </v-btn>
              </v-card-actions>
            </v-form>
          </template>
        </v-card>
      </v-dialog>

      <!-- Success dialog -->
      <v-dialog
        v-model="successDialog"
        max-width="460"
        persistent
      >
        <v-card rounded="lg">
          <v-card-text class="text-center pa-8">
            <v-avatar
              color="green-lighten-5"
              size="72"
              class="mb-4"
            >
              <v-icon
                color="green-darken-3"
                size="42"
              >
                mdi-check-circle
              </v-icon>
            </v-avatar>

            <h2
              class="text-h5 font-weight-bold mb-2"
            >
              Matagumpay ang Order!
            </h2>

            <p
              class="text-body-2 text-medium-emphasis mb-6"
            >
              Naisumite na ang iyong order.
              Itago ang order code bilang reference.
            </p>

            <template v-if="submittedOrder">
              <v-sheet
                color="green-lighten-5"
                rounded="lg"
                class="pa-4 mb-5"
              >
                <div
                  class="text-caption text-medium-emphasis"
                >
                  Order Code
                </div>

                <div
                  class="text-h6 font-weight-bold text-green-darken-4"
                >
                  {{ submittedOrder.order_code }}
                </div>
              </v-sheet>

              <v-list density="compact">
                <v-list-item>
                  <v-list-item-title>
                    Produkto
                  </v-list-item-title>

                  <template #append>
                    <strong>
                      {{
                        submittedOrder
                          .product
                          .product_name
                      }}
                    </strong>
                  </template>
                </v-list-item>

                <v-list-item>
                  <v-list-item-title>
                    Dami
                  </v-list-item-title>

                  <template #append>
                    <strong>
                      {{ submittedOrder.quantity }}
                      {{
                        submittedOrder
                          .product
                          .unit
                      }}
                    </strong>
                  </template>
                </v-list-item>

                <v-list-item>
                  <v-list-item-title>
                    Kabuuan
                  </v-list-item-title>

                  <template #append>
                    <strong
                      class="text-green-darken-3"
                    >
                      {{
                        formatPrice(
                          submittedOrder
                            .total_amount,
                        )
                      }}
                    </strong>
                  </template>
                </v-list-item>

                <v-list-item>
                  <v-list-item-title>
                    Natitirang stock
                  </v-list-item-title>

                  <template #append>
                    <strong>
                      {{
                        submittedOrder
                          .remaining_stock
                      }}
                      {{
                        submittedOrder
                          .product
                          .unit
                      }}
                    </strong>
                  </template>
                </v-list-item>
              </v-list>
            </template>
          </v-card-text>

          <v-card-actions class="pa-4 pt-0">
            <v-btn
              color="green-darken-3"
              variant="flat"
              block
              @click="closeSuccessDialog"
            >
              Tapos
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<style scoped>
.quantity-display {
  width: 48px;
  height: 36px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-weight: 700;
  background: white;
}

.stock-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
}
</style>