import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const client = neon(process.env.DATABASE_URL!)
const db = drizzle(client, { schema })

async function seed() {
  console.log('Seeding database...')

  // --- Brands ---
  const brandData = [
    { name: 'Harney & Sons', country: 'USA', website: 'https://www.harney.com' },
    { name: 'Rishi Tea', country: 'USA', website: 'https://www.rishi-tea.com' },
    { name: 'Vahdam', country: 'India', website: 'https://www.vahdamteas.com' },
    { name: 'Yorkshire Tea', country: 'UK', website: 'https://www.yorkshiretea.co.uk' },
    { name: 'Twinings', country: 'UK', website: 'https://www.twinings.co.uk' },
    { name: 'Mariage Freres', country: 'France', website: 'https://www.mariagefreres.com' },
    { name: 'Lupicia', country: 'Japan', website: 'https://www.lupicia.com' },
    { name: 'Ippodo', country: 'Japan', website: 'https://www.ippodo-tea.co.jp' },
    { name: 'Yunnan Sourcing', country: 'China', website: 'https://yunnansourcing.com' },
    { name: 'Ahmad Tea', country: 'UK', website: 'https://www.ahmadtea.com' },
    { name: 'Tazo', country: 'USA', website: 'https://www.tazo.com' },
    { name: 'Celestial Seasonings', country: 'USA', website: 'https://www.celestialseasonings.com' },
    { name: 'Republic of Tea', country: 'USA', website: 'https://www.republicoftea.com' },
    { name: 'DAVIDsTEA', country: 'Canada', website: 'https://www.davidstea.com' },
    { name: 'TWG Tea', country: 'Singapore', website: 'https://www.twgtea.com' },
  ]

  await db.insert(schema.brands).values(brandData).onConflictDoNothing()
  const brands = await db.select().from(schema.brands)
  const brandMap = Object.fromEntries(brands.map((b) => [b.name, b.id]))

  // --- Teas ---
  const teaData: (typeof schema.teas.$inferInsert)[] = [
    // Green teas
    { name: 'Gyokuro Imperial', brandId: brandMap['Ippodo'], type: 'green', subtype: 'gyokuro', origin: 'Uji, Kyoto, Japan', caffeineLevel: 'high', leafStyle: 'loose' },
    { name: 'Dragon Well (Longjing)', brandId: brandMap['Yunnan Sourcing'], type: 'green', subtype: 'longjing', origin: 'Hangzhou, China', caffeineLevel: 'medium', leafStyle: 'loose' },
    { name: 'Organic Sencha', brandId: brandMap['Rishi Tea'], type: 'green', subtype: 'sencha', origin: 'Kagoshima, Japan', caffeineLevel: 'medium', leafStyle: 'loose' },
    { name: 'Jasmine Pearls', brandId: brandMap['TWG Tea'], type: 'green', subtype: 'jasmine', origin: 'Fujian, China', caffeineLevel: 'medium', leafStyle: 'loose' },
    { name: 'Moroccan Mint Green Tea', brandId: brandMap['Twinings'], type: 'green', origin: 'China', caffeineLevel: 'medium', leafStyle: 'bag' },

    // Black teas
    { name: 'English Breakfast', brandId: brandMap['Harney & Sons'], type: 'black', origin: 'India/Sri Lanka blend', caffeineLevel: 'high', leafStyle: 'loose' },
    { name: 'Darjeeling First Flush', brandId: brandMap['Vahdam'], type: 'black', subtype: 'darjeeling', origin: 'Darjeeling, India', caffeineLevel: 'medium', leafStyle: 'loose' },
    { name: 'Earl Grey Supreme', brandId: brandMap['Twinings'], type: 'black', subtype: 'earl grey', origin: 'China/India blend', caffeineLevel: 'high', leafStyle: 'bag' },
    { name: 'Yorkshire Gold', brandId: brandMap['Yorkshire Tea'], type: 'black', origin: 'Assam/Kenya blend', caffeineLevel: 'high', leafStyle: 'bag' },
    { name: 'Keemun Mao Feng', brandId: brandMap['Yunnan Sourcing'], type: 'black', subtype: 'keemun', origin: 'Anhui, China', caffeineLevel: 'medium', leafStyle: 'loose' },
    { name: 'Marco Polo', brandId: brandMap['Mariage Freres'], type: 'black', origin: 'China/Tibet blend', caffeineLevel: 'high', leafStyle: 'loose' },
    { name: 'Assam Breakfast', brandId: brandMap['Ahmad Tea'], type: 'black', subtype: 'assam', origin: 'Assam, India', caffeineLevel: 'high', leafStyle: 'bag' },

    // White teas
    { name: 'Silver Needle', brandId: brandMap['TWG Tea'], type: 'white', subtype: 'bai hao yin zhen', origin: 'Fujian, China', caffeineLevel: 'low', leafStyle: 'loose' },
    { name: 'White Peony (Bai Mudan)', brandId: brandMap['Rishi Tea'], type: 'white', subtype: 'bai mudan', origin: 'Fujian, China', caffeineLevel: 'low', leafStyle: 'loose' },
    { name: 'Moonlight White', brandId: brandMap['Yunnan Sourcing'], type: 'white', origin: 'Yunnan, China', caffeineLevel: 'low', leafStyle: 'cake' },

    // Oolong teas
    { name: 'Tie Guan Yin (Iron Goddess)', brandId: brandMap['Yunnan Sourcing'], type: 'oolong', subtype: 'tieguanyin', origin: 'Anxi, Fujian, China', caffeineLevel: 'medium', leafStyle: 'loose' },
    { name: 'Da Hong Pao', brandId: brandMap['TWG Tea'], type: 'oolong', subtype: 'wuyi rock', origin: 'Wuyi Mountains, China', caffeineLevel: 'medium', leafStyle: 'loose' },
    { name: 'High Mountain Oolong', brandId: brandMap['Lupicia'], type: 'oolong', subtype: 'gaoshan', origin: 'Ali Shan, Taiwan', caffeineLevel: 'medium', leafStyle: 'loose' },
    { name: 'Oriental Beauty', brandId: brandMap['Lupicia'], type: 'oolong', subtype: 'dong fang mei ren', origin: 'Hsinchu, Taiwan', caffeineLevel: 'medium', leafStyle: 'loose' },

    // Puerh teas
    { name: 'Menghai Ripe Puerh 2019', brandId: brandMap['Yunnan Sourcing'], type: 'puerh', subtype: 'shou', origin: 'Menghai, Yunnan, China', caffeineLevel: 'high', leafStyle: 'cake' },
    { name: 'Wild Arbor Raw Puerh', brandId: brandMap['Yunnan Sourcing'], type: 'puerh', subtype: 'sheng', origin: 'Yiwu, Yunnan, China', caffeineLevel: 'high', leafStyle: 'cake' },

    // Herbal teas
    { name: 'Chamomile', brandId: brandMap['Celestial Seasonings'], type: 'herbal', subtype: 'chamomile', origin: 'Egypt', caffeineLevel: 'low', leafStyle: 'bag' },
    { name: 'Peppermint', brandId: brandMap['Tazo'], type: 'herbal', subtype: 'peppermint', origin: 'USA', caffeineLevel: 'low', leafStyle: 'bag' },
    { name: 'Sleepytime', brandId: brandMap['Celestial Seasonings'], type: 'herbal', origin: 'USA', caffeineLevel: 'low', leafStyle: 'bag' },
    { name: 'Turmeric Ginger', brandId: brandMap['Republic of Tea'], type: 'herbal', origin: 'India', caffeineLevel: 'low', leafStyle: 'bag' },
    { name: 'Hibiscus Sangria', brandId: brandMap['DAVIDsTEA'], type: 'herbal', subtype: 'hibiscus', origin: 'Blend', caffeineLevel: 'low', leafStyle: 'loose' },

    // Mate
    { name: 'Organic Yerba Mate', brandId: brandMap['Rishi Tea'], type: 'mate', origin: 'Argentina', caffeineLevel: 'high', leafStyle: 'loose' },
    { name: 'Chai Mate', brandId: brandMap['Tazo'], type: 'mate', origin: 'Brazil', caffeineLevel: 'high', leafStyle: 'bag' },

    // Rooibos
    { name: 'Organic Rooibos', brandId: brandMap['Republic of Tea'], type: 'rooibos', origin: 'South Africa', caffeineLevel: 'low', leafStyle: 'bag' },
    { name: 'Vanilla Rooibos', brandId: brandMap['DAVIDsTEA'], type: 'rooibos', origin: 'South Africa', caffeineLevel: 'low', leafStyle: 'loose' },
    { name: 'Rooibos Bourbon', brandId: brandMap['Mariage Freres'], type: 'rooibos', origin: 'South Africa', caffeineLevel: 'low', leafStyle: 'loose' },

    // A few more interesting ones
    { name: 'Matcha Ceremonial Grade', brandId: brandMap['Ippodo'], type: 'green', subtype: 'matcha', origin: 'Uji, Kyoto, Japan', caffeineLevel: 'high', leafStyle: 'powder' },
    { name: 'Genmaicha', brandId: brandMap['Lupicia'], type: 'green', subtype: 'genmaicha', origin: 'Japan', caffeineLevel: 'medium', leafStyle: 'loose' },
    { name: 'Lapsang Souchong', brandId: brandMap['Harney & Sons'], type: 'black', subtype: 'lapsang souchong', origin: 'Fujian, China', caffeineLevel: 'medium', leafStyle: 'loose' },
    { name: 'Golden Monkey', brandId: brandMap['Rishi Tea'], type: 'black', subtype: 'dian hong', origin: 'Yunnan, China', caffeineLevel: 'high', leafStyle: 'loose' },
    { name: 'Imperial Formosa Oolong', brandId: brandMap['Harney & Sons'], type: 'oolong', origin: 'Taiwan', caffeineLevel: 'medium', leafStyle: 'loose' },
  ]

  await db.insert(schema.teas).values(teaData).onConflictDoNothing()

  // --- Flavor Tags ---
  const flavorTagData = [
    // Floral
    { name: 'jasmine', category: 'floral' },
    { name: 'rose', category: 'floral' },
    { name: 'lavender', category: 'floral' },
    { name: 'orchid', category: 'floral' },

    // Fruity
    { name: 'citrus', category: 'fruity' },
    { name: 'berry', category: 'fruity' },
    { name: 'peach', category: 'fruity' },
    { name: 'tropical', category: 'fruity' },

    // Earthy
    { name: 'woody', category: 'earthy' },
    { name: 'mushroom', category: 'earthy' },
    { name: 'mineral', category: 'earthy' },
    { name: 'moss', category: 'earthy' },

    // Nutty
    { name: 'roasted', category: 'nutty' },
    { name: 'almond', category: 'nutty' },
    { name: 'chestnut', category: 'nutty' },

    // Sweet
    { name: 'honey', category: 'sweet' },
    { name: 'caramel', category: 'sweet' },
    { name: 'vanilla', category: 'sweet' },
    { name: 'chocolate', category: 'sweet' },

    // Spicy
    { name: 'ginger', category: 'spicy' },
    { name: 'cinnamon', category: 'spicy' },
    { name: 'pepper', category: 'spicy' },
    { name: 'clove', category: 'spicy' },

    // Vegetal
    { name: 'grassy', category: 'vegetal' },
    { name: 'seaweed', category: 'vegetal' },
    { name: 'spinach', category: 'vegetal' },

    // Other
    { name: 'smoky', category: 'other' },
    { name: 'malty', category: 'other' },
    { name: 'astringent', category: 'other' },
    { name: 'creamy', category: 'other' },
  ]

  await db.insert(schema.flavorTags).values(flavorTagData).onConflictDoNothing()

  // --- Users ---
  const userData = [
    { name: 'Admin', email: 'admin@leafscore.app', isAdmin: true },
    { name: 'Tea Lover', email: 'test@leafscore.app' },
  ]

  await db.insert(schema.users).values(userData).onConflictDoNothing()

  // --- Print counts ---
  const brandCount = (await db.select().from(schema.brands)).length
  const teaCount = (await db.select().from(schema.teas)).length
  const tagCount = (await db.select().from(schema.flavorTags)).length
  const userCount = (await db.select().from(schema.users)).length

  console.log(
    `Seeded ${brandCount} brands, ${teaCount} teas, ${tagCount} flavor tags, ${userCount} users`,
  )
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
