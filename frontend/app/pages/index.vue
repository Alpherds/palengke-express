<script setup lang="ts">
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
  price: number
  unit: string
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

const config = useRuntimeConfig()

const {
  data: response,
  status,
  error,
  refresh,
} = await useFetch<ProductsResponse>('/api/products', {
  baseURL: config.public.strapiUrl,

  query: {
    populate: 'image',
    'filters[is_active][$eq]': true,
    sort: 'product_name:asc',
  },
})

const products = computed(() => response.value?.data ?? [])

/*
|--------------------------------------------------------------------------
| Product quantities
|--------------------------------------------------------------------------
|
| Each product uses its documentId as its quantity key.
|
*/

const quantities = reactive<Record<string, number>>({})

function getQuantity(product: Product): number {
  return quantities[product.documentId] ?? 0
}

function increaseQuantity(product: Product) {
  quantities[product.documentId] = getQuantity(product) + 1
}

function decreaseQuantity(product: Product) {
  const currentQuantity = getQuantity(product)

  if (currentQuantity <= 0) {
    quantities[product.documentId] = 0
    return
  }

  quantities[product.documentId] = currentQuantity - 1
}

function getProductTotal(product: Product): number {
  return Number(product.price) * getQuantity(product)
}

/*
|--------------------------------------------------------------------------
| Order preview dialog
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

function openOrderDialog(product: Product) {
  if (getQuantity(product) < 1) {
    return
  }

  selectedProduct.value = product
  orderDialog.value = true
}

function closeOrderDialog() {
  orderDialog.value = false
}

/*
|--------------------------------------------------------------------------
| Display helpers
|--------------------------------------------------------------------------
*/

function getImageUrl(product: Product): string {
  if (!product.image?.url) {
    return ''
  }

  return `${config.public.strapiUrl}${product.image.url}`
}

function formatPrice(price: number): string {
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
          <h1 class="text-h4 font-weight-bold text-green-darken-4">
            Palengke Express
          </h1>

          <p class="text-body-1 text-medium-emphasis mt-2">
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
          Siguraduhing tumatakbo ang Strapi backend.

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

        <!-- Product grid -->
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
              <v-img
                :src="getImageUrl(product)"
                :alt="
                  product.image?.alternativeText
                    || product.product_name
                "
                height="210"
                cover
              >
                <template #placeholder>
                  <div
                    class="d-flex align-center justify-center fill-height"
                  >
                    <v-progress-circular indeterminate />
                  </div>
                </template>
              </v-img>

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
                <!-- Product price -->
                <div
                  class="text-h6 font-weight-bold text-green-darken-3 mb-4"
                >
                  {{ formatPrice(product.price) }}
                </div>

                <!-- Quantity control -->
                <div class="text-caption text-medium-emphasis mb-2">
                  Dami
                </div>

                <div class="d-flex align-center ga-2 mb-4">
                  <v-btn
                    size="small"
                    variant="outlined"
                    min-width="40"
                    :disabled="getQuantity(product) === 0"
                    @click="decreaseQuantity(product)"
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
                    @click="increaseQuantity(product)"
                  >
                    +
                  </v-btn>
                </div>

                <!-- Total -->
                <div class="d-flex justify-space-between align-center">
                  <span class="text-body-2 text-medium-emphasis">
                    Kabuuan
                  </span>

                  <span class="font-weight-bold">
                    {{ formatPrice(getProductTotal(product)) }}
                  </span>
                </div>
              </v-card-text>

              <v-card-actions class="pa-3 pt-0">
                <v-btn
                  color="green-darken-3"
                  variant="flat"
                  block
                  :disabled="getQuantity(product) < 1"
                  @click="openOrderDialog(product)"
                >
                  Umorder
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-container>

      <!-- Order preview dialog -->
      <v-dialog
        v-model="orderDialog"
        max-width="480"
      >
        <v-card rounded="lg">
          <v-card-title class="d-flex align-center justify-space-between">
            <span>Kumpirmahin ang Order</span>

            <v-btn
              variant="text"
              icon
              @click="closeOrderDialog"
            >
              ✕
            </v-btn>
          </v-card-title>

          <v-divider />

          <template v-if="selectedProduct">
            <v-img
              :src="getImageUrl(selectedProduct)"
              :alt="selectedProduct.product_name"
              height="220"
              cover
            />

            <v-card-text>
              <h3 class="text-h6 font-weight-bold mb-1">
                {{ selectedProduct.product_name }}
              </h3>

              <p class="text-body-2 text-medium-emphasis mb-5">
                {{ formatPrice(selectedProduct.price) }}
                kada {{ selectedProduct.unit }}
              </p>

              <v-list
                density="compact"
                class="pa-0"
              >
                <v-list-item>
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

                <v-list-item>
                  <v-list-item-title>
                    Kabuuang halaga
                  </v-list-item-title>

                  <template #append>
                    <strong class="text-green-darken-3">
                      {{ formatPrice(selectedTotal) }}
                    </strong>
                  </template>
                </v-list-item>
              </v-list>
            </v-card-text>

            <v-card-actions class="pa-4 pt-0">
              <v-btn
                variant="outlined"
                @click="closeOrderDialog"
              >
                Bumalik
              </v-btn>

              <v-spacer />

              <v-btn
                color="green-darken-3"
                variant="flat"
                disabled
              >
                Magpatuloy
              </v-btn>
            </v-card-actions>
          </template>
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
</style>