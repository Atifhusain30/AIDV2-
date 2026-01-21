import { ServiceType } from '../types'
import { 
  TowingFormData, 
  EVChargingFormData, 
  DetailingFormData, 
  WindowTintingFormData 
} from '../store/useAppStore'

// Vehicle size multipliers
const vehicleSizeMultiplier: Record<string, number> = {
  compact: 1.0,
  sedan: 1.0,
  suv: 1.2,
  truck: 1.5,
  van: 1.3,
  motorcycle: 0.7,
}

// Service base prices and ETAs
export const serviceEstimates: Record<ServiceType, { basePrice: number; eta: number; description: string }> = {
  oil_change: { basePrice: 75, eta: 30, description: 'Full synthetic oil change' },
  battery_jump: { basePrice: 45, eta: 15, description: 'Jump start service' },
  flat_tire: { basePrice: 65, eta: 25, description: 'Tire change or repair' },
  lockout: { basePrice: 55, eta: 20, description: 'Vehicle lockout assistance' },
  towing: { basePrice: 95, eta: 35, description: 'Towing service' },
  ev_charging: { basePrice: 85, eta: 45, description: 'Mobile EV charging' },
  fuel_delivery: { basePrice: 50, eta: 20, description: 'Emergency fuel delivery' },
  detailing: { basePrice: 79, eta: 90, description: 'Car detailing service' },
  window_tinting: { basePrice: 250, eta: 180, description: 'Window tinting service' },
}

// Calculate service estimate
export function calculateServiceEstimate(
  serviceType: ServiceType,
  vehicleType: string | null
): { serviceFee: number; total: number; eta: number } {
  const base = serviceEstimates[serviceType]
  const multiplier = vehicleType ? vehicleSizeMultiplier[vehicleType] || 1 : 1
  const serviceFee = Math.round(base.basePrice * multiplier)
  
  return {
    serviceFee,
    total: serviceFee,
    eta: base.eta,
  }
}

// Calculate towing estimate
export function calculateTowingEstimate(data: TowingFormData): {
  baseFee: number
  perMileFee: number
  mileage: number
  total: number
  eta: number
} {
  const baseFee = 75
  const perMileRate = 4
  const mileage = data.distance || Math.floor(Math.random() * 15) + 5 // Mock distance
  const multiplier = data.vehicleType ? vehicleSizeMultiplier[data.vehicleType] || 1 : 1
  const additionalFee = !data.isDrivable ? 25 : 0
  
  const perMileFee = Math.round(perMileRate * mileage)
  const total = Math.round((baseFee + perMileFee + additionalFee) * multiplier)
  
  return {
    baseFee,
    perMileFee,
    mileage,
    total,
    eta: Math.round(15 + mileage * 1.5),
  }
}

// Calculate EV charging estimate
export function calculateEVChargingEstimate(data: EVChargingFormData): {
  serviceFee: number
  energyCost: number
  kWhNeeded: number
  chargeTime: number
  total: number
} {
  const serviceFee = 25
  const perKWhRate = 0.35
  
  // Estimate battery capacity based on make
  const batteryCapacities: Record<string, number> = {
    tesla: 75,
    rivian: 135,
    ford: 98,
    chevrolet: 66,
    hyundai: 77,
    kia: 77,
    bmw: 84,
    mercedes: 108,
    audi: 95,
    porsche: 93,
    default: 70,
  }
  
  const capacity = batteryCapacities[data.evMake.toLowerCase()] || batteryCapacities.default
  const chargeNeeded = (data.desiredCharge - data.currentCharge) / 100
  const kWhNeeded = Math.round(capacity * chargeNeeded)
  const energyCost = Math.round(kWhNeeded * perKWhRate * 100) / 100
  const chargeTime = Math.round(kWhNeeded * 2) // ~2 min per kWh for mobile charger
  
  return {
    serviceFee,
    energyCost,
    kWhNeeded,
    chargeTime,
    total: Math.round((serviceFee + energyCost) * 100) / 100,
  }
}

// Detailing packages
export const detailingPackages = {
  basic: {
    name: 'Basic Wash',
    price: 29,
    features: ['Exterior hand wash', 'Wheel cleaning', 'Tire dressing', 'Window cleaning'],
    duration: 30,
  },
  standard: {
    name: 'Standard Detail',
    price: 79,
    features: ['Everything in Basic', 'Interior vacuum', 'Dashboard wipe', 'Door jambs cleaned', 'Air freshener'],
    duration: 90,
  },
  premium: {
    name: 'Premium Detail',
    price: 149,
    features: ['Everything in Standard', 'Hand wax application', 'Leather conditioning', 'Deep interior clean', 'Engine bay rinse'],
    duration: 180,
  },
  ultimate: {
    name: 'Ultimate Package',
    price: 249,
    features: ['Everything in Premium', 'Ceramic coating', 'Paint correction', 'Headlight restoration', 'Complete interior restoration'],
    duration: 300,
  },
}

export const detailingAddOns = {
  engine_cleaning: { name: 'Engine Bay Cleaning', price: 45 },
  headlight_restoration: { name: 'Headlight Restoration', price: 35 },
  pet_hair_removal: { name: 'Pet Hair Removal', price: 40 },
  odor_elimination: { name: 'Odor Elimination', price: 50 },
  scratch_removal: { name: 'Minor Scratch Removal', price: 75 },
}

// Calculate detailing estimate
export function calculateDetailingEstimate(data: DetailingFormData): {
  packagePrice: number
  packageName: string
  addOnsTotal: number
  addOnsList: { name: string; price: number }[]
  sizeMultiplier: number
  total: number
  duration: number
} {
  const pkg = data.package ? detailingPackages[data.package] : detailingPackages.basic
  const sizeMultiplier = data.vehicleSize ? vehicleSizeMultiplier[data.vehicleSize] || 1 : 1
  
  const addOnsList = data.addOns.map(id => ({
    name: detailingAddOns[id as keyof typeof detailingAddOns]?.name || id,
    price: detailingAddOns[id as keyof typeof detailingAddOns]?.price || 0,
  }))
  
  const addOnsTotal = addOnsList.reduce((sum, addon) => sum + addon.price, 0)
  const packagePrice = Math.round(pkg.price * sizeMultiplier)
  
  return {
    packagePrice,
    packageName: pkg.name,
    addOnsTotal,
    addOnsList,
    sizeMultiplier,
    total: packagePrice + addOnsTotal,
    duration: pkg.duration,
  }
}

// Window tinting options
export const tintTypes = {
  ceramic: {
    name: 'Ceramic Tint',
    priceMultiplier: 1.8,
    features: ['99% UV rejection', 'Superior heat rejection', 'No signal interference', 'Lifetime warranty'],
    warranty: 'Lifetime',
  },
  carbon: {
    name: 'Carbon Tint',
    priceMultiplier: 1.4,
    features: ['99% UV rejection', 'Good heat rejection', 'No fading', '10-year warranty'],
    warranty: '10 years',
  },
  dyed: {
    name: 'Dyed Tint',
    priceMultiplier: 1.0,
    features: ['Privacy enhancement', 'Glare reduction', 'Budget friendly', '5-year warranty'],
    warranty: '5 years',
  },
}

export const windowPrices = {
  frontWindshield: 150,
  frontSide: 80,
  rearSide: 80,
  backWindshield: 100,
  sunroof: 75,
}

export const shadeLevels = [
  { value: 5, label: '5% (Limo)', legal: false, description: 'Very dark, often illegal' },
  { value: 15, label: '15%', legal: false, description: 'Dark, check local laws' },
  { value: 20, label: '20%', legal: true, description: 'Dark, popular choice' },
  { value: 35, label: '35%', legal: true, description: 'Medium, most popular' },
  { value: 50, label: '50%', legal: true, description: 'Light, good visibility' },
]

// Calculate window tinting estimate
export function calculateWindowTintingEstimate(data: WindowTintingFormData): {
  windowBreakdown: { window: string; price: number }[]
  baseTotal: number
  tintMultiplier: number
  tintTypeName: string
  total: number
  installationTime: number
} {
  const tint = data.tintType ? tintTypes[data.tintType] : tintTypes.dyed
  
  const windowBreakdown: { window: string; price: number }[] = []
  
  if (data.coverage.frontWindshield) {
    windowBreakdown.push({ window: 'Front Windshield', price: windowPrices.frontWindshield })
  }
  if (data.coverage.frontSide) {
    windowBreakdown.push({ window: 'Front Side Windows (2)', price: windowPrices.frontSide * 2 })
  }
  if (data.coverage.rearSide) {
    windowBreakdown.push({ window: 'Rear Side Windows (2)', price: windowPrices.rearSide * 2 })
  }
  if (data.coverage.backWindshield) {
    windowBreakdown.push({ window: 'Back Windshield', price: windowPrices.backWindshield })
  }
  if (data.coverage.sunroof) {
    windowBreakdown.push({ window: 'Sunroof', price: windowPrices.sunroof })
  }
  
  const baseTotal = windowBreakdown.reduce((sum, w) => sum + w.price, 0)
  const total = Math.round(baseTotal * tint.priceMultiplier)
  const installationTime = Math.round(windowBreakdown.length * 0.75) // ~45 min per window area
  
  return {
    windowBreakdown,
    baseTotal,
    tintMultiplier: tint.priceMultiplier,
    tintTypeName: tint.name,
    total,
    installationTime: Math.max(installationTime, 2), // minimum 2 hours
  }
}

// EV makes and models
export const evMakesModels: Record<string, string[]> = {
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'],
  Rivian: ['R1T', 'R1S'],
  Ford: ['Mustang Mach-E', 'F-150 Lightning'],
  Chevrolet: ['Bolt EV', 'Bolt EUV', 'Equinox EV', 'Silverado EV'],
  Hyundai: ['Ioniq 5', 'Ioniq 6', 'Kona Electric'],
  Kia: ['EV6', 'EV9', 'Niro EV'],
  BMW: ['i4', 'iX', 'i7'],
  Mercedes: ['EQS', 'EQE', 'EQB'],
  Audi: ['e-tron', 'e-tron GT', 'Q4 e-tron'],
  Porsche: ['Taycan'],
  Volkswagen: ['ID.4', 'ID.Buzz'],
  Nissan: ['Leaf', 'Ariya'],
  Lucid: ['Air'],
  Polestar: ['2', '3'],
}

// Battery types based on make
export const batteryTypes: Record<string, string> = {
  Tesla: 'Lithium-ion NCA',
  Rivian: 'Lithium-ion NMC',
  Ford: 'Lithium-ion NMC',
  Chevrolet: 'Lithium-ion NMC',
  Hyundai: 'Lithium-ion NMC',
  Kia: 'Lithium-ion NMC',
  BMW: 'Lithium-ion NMC',
  Mercedes: 'Lithium-ion NMC',
  Audi: 'Lithium-ion NMC',
  Porsche: 'Lithium-ion NMC',
  default: 'Lithium-ion',
}




