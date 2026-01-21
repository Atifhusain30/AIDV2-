import { Service, Mechanic, Vehicle, Booking, SavedAddress, Notification, Message } from '../types'

export const services: Service[] = [
  {
    id: 'oil_change',
    name: 'Oil Change',
    description: 'Full synthetic oil change service',
    basePrice: 75,
    estimatedTime: 30,
  },
  {
    id: 'battery_jump',
    name: 'Battery Jump',
    description: 'Jump start your dead battery',
    basePrice: 45,
    estimatedTime: 15,
  },
  {
    id: 'flat_tire',
    name: 'Flat Tire',
    description: 'Tire change or repair service',
    basePrice: 65,
    estimatedTime: 25,
  },
  {
    id: 'lockout',
    name: 'Lockout',
    description: "Locked out? We'll get you in",
    basePrice: 55,
    estimatedTime: 20,
  },
  {
    id: 'towing',
    name: 'Towing',
    description: 'Tow to nearest shop or destination',
    basePrice: 95,
    estimatedTime: 35,
  },
  {
    id: 'ev_charging',
    name: 'EV Charging',
    description: 'Mobile EV charging service',
    basePrice: 85,
    estimatedTime: 45,
  },
  {
    id: 'fuel_delivery',
    name: 'Fuel Delivery',
    description: "Out of gas? We'll bring fuel to you",
    basePrice: 50,
    estimatedTime: 20,
  },
]

export const nearbyMechanics: Mechanic[] = [
  {
    id: 'm1',
    name: 'Mike Rodriguez',
    initials: 'MR',
    rating: 4.9,
    totalJobs: 847,
    specializations: ['oil_change', 'battery_jump', 'flat_tire'],
    location: { lat: 32.8801, lng: -96.7782 },
    eta: 8,
    isOnline: true,
  },
  {
    id: 'm2',
    name: 'Sarah Chen',
    initials: 'SC',
    rating: 4.8,
    totalJobs: 623,
    specializations: ['ev_charging', 'battery_jump', 'lockout'],
    location: { lat: 32.8850, lng: -96.7650 },
    eta: 12,
    isOnline: true,
  },
  {
    id: 'm3',
    name: 'James Wilson',
    initials: 'JW',
    rating: 4.7,
    totalJobs: 1205,
    specializations: ['towing', 'flat_tire', 'fuel_delivery'],
    location: { lat: 32.8720, lng: -96.7900 },
    eta: 18,
    isOnline: true,
  },
  {
    id: 'm4',
    name: 'David Park',
    initials: 'DP',
    rating: 4.9,
    totalJobs: 432,
    specializations: ['oil_change', 'battery_jump'],
    location: { lat: 32.8900, lng: -96.7550 },
    eta: 15,
    isOnline: true,
  },
  {
    id: 'm5',
    name: 'Lisa Martinez',
    initials: 'LM',
    rating: 4.6,
    totalJobs: 289,
    specializations: ['lockout', 'battery_jump', 'fuel_delivery'],
    location: { lat: 32.8650, lng: -96.7800 },
    eta: 22,
    isOnline: true,
  },
]

export const userVehicles: Vehicle[] = [
  {
    id: 'v1',
    make: 'Tesla',
    model: 'Model 3',
    year: 2023,
    color: 'White',
    licensePlate: 'ABC 1234',
    isElectric: true,
  },
  {
    id: 'v2',
    make: 'Toyota',
    model: 'Camry',
    year: 2021,
    color: 'Silver',
    licensePlate: 'XYZ 5678',
    isElectric: false,
  },
]

export const savedAddresses: SavedAddress[] = [
  {
    id: 'a1',
    label: 'Home',
    address: '123 Main Street, Dallas, TX 75201',
    lat: 32.7767,
    lng: -96.7970,
  },
  {
    id: 'a2',
    label: 'Work',
    address: '456 Commerce St, Dallas, TX 75202',
    lat: 32.7831,
    lng: -96.7984,
  },
]

export const mockBookingHistory: Booking[] = [
  {
    id: 'b1',
    customerId: 'demo_user',
    service: services[1],
    status: 'completed',
    mechanic: nearbyMechanics[0],
    vehicle: {
      vehicleId: userVehicles[0].id,
      label: `${userVehicles[0].year} ${userVehicles[0].make} ${userVehicles[0].model}`,
      plate: userVehicles[0].licensePlate,
    },
    location: {
      address: '789 Elm St, Dallas, TX',
      lat: 32.7800,
      lng: -96.8000,
    },
    estimatedPrice: 45,
    createdAt: new Date(Date.now() - 86400000 * 3),
  },
  {
    id: 'b2',
    customerId: 'demo_user',
    service: services[2],
    status: 'completed',
    mechanic: nearbyMechanics[2],
    vehicle: {
      vehicleId: userVehicles[1].id,
      label: `${userVehicles[1].year} ${userVehicles[1].make} ${userVehicles[1].model}`,
      plate: userVehicles[1].licensePlate,
    },
    location: {
      address: '321 Oak Ave, Dallas, TX',
      lat: 32.7850,
      lng: -96.7950,
    },
    estimatedPrice: 65,
    createdAt: new Date(Date.now() - 86400000 * 10),
  },
]

export const mockNotifications: Notification[] = [
  {
    id: 'n1',
    userId: 'demo_user',
    type: 'promo',
    title: '20% Off Your Next Service',
    body: 'Use code SAVE20 for 20% off any service this week!',
    timestamp: new Date(Date.now() - 3600000),
    isRead: false,
  },
  {
    id: 'n2',
    userId: 'demo_user',
    type: 'system',
    title: 'Welcome to AID',
    body: 'Thanks for joining! Your safety is our priority.',
    timestamp: new Date(Date.now() - 86400000),
    isRead: true,
  },
]

export const mockMessages: Message[] = [
  {
    id: 'msg1',
    bookingId: 'b1',
    senderId: 'm1',
    senderType: 'driver',
    content: "Hi! I'm on my way to your location now.",
    timestamp: new Date(Date.now() - 300000),
    isRead: true,
  },
  {
    id: 'msg2',
    bookingId: 'b1',
    senderId: 'user',
    senderType: 'customer',
    content: "Great, thank you! I'm parked near the entrance.",
    timestamp: new Date(Date.now() - 240000),
    isRead: true,
  },
  {
    id: 'msg3',
    bookingId: 'b1',
    senderId: 'm1',
    senderType: 'driver',
    content: "Perfect, I'll be there in about 5 minutes.",
    timestamp: new Date(Date.now() - 180000),
    isRead: true,
  },
]



