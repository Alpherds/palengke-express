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
        <div class="mb-8">
          <h1 class="text-h4 font-weight-bold text-green-darken-4">
            Palengke Express
          </h1>

          <p class="text-body-1 text-medium-emphasis">
            Sariling sariwa, diretso sa bahay.
          </p>
        </div>

        <h2 class="text-h5 font-weight-bold mb-5">
          Mga Paninda Ngayong Araw
        </h2>

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

        <v-alert
          v-else-if="error"
          type="error"
          variant="tonal"
          title="Hindi makuha ang mga produkto"
          class="mb-6"
        >
          Siguraduhing tumatakbo ang Strapi backend sa
          http://localhost:1337.

          <template #append>
            <v-btn
              variant="text"
              @click="refresh()"
            >
              Subukan muli
            </v-btn>
          </template>
        </v-alert>

        <v-alert
          v-else-if="products.length === 0"
          type="info"
          variant="tonal"
        >
          Wala pang available na produkto.
        </v-alert>

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
            >
              <v-img
                :src="getImageUrl(product)"
                :alt="product.image?.alternativeText || product.product_name"
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
                <v-card-title class="text-subtitle-1 font-weight-bold">
                  {{ product.product_name }}
                </v-card-title>

                <v-card-subtitle>
                  Presyo kada {{ product.unit }}
                </v-card-subtitle>
              </v-card-item>

              <v-card-text>
                <div class="text-h6 font-weight-bold text-green-darken-3">
                  {{ formatPrice(product.price) }}
                </div>
              </v-card-text>

              <v-card-actions>
                <v-btn
                  color="green-darken-3"
                  variant="flat"
                  block
                  disabled
                >
                  Umorder
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>