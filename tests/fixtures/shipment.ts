import type { CreateShipmentInput } from '../../src/modules/couriers/courier.types.js';

export const fixedTime = new Date('2026-08-03T12:00:00.000Z');

export const shipment: CreateShipmentInput = {
  orderId: 'EC-MOCK-001',
  serviceLevel: 'NEXT_DAY',
  consignee: {
    name: 'Aarav Sharma',
    phone: '+919876543210',
    addressLine1: '12 MG Road',
    addressType: 'HOME',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'IN',
    postalCode: '560001',
  },
  shipper: {
    name: 'EaseCommerce Warehouse',
    phone: '+919811111111',
    addressLine1: 'Plot 18, Sector 17',
    addressType: 'BUSINESS',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'IN',
    postalCode: '122001',
  },
  returnAddress: {
    name: 'EaseCommerce Warehouse',
    phone: '+919811111111',
    addressLine1: 'Plot 18, Sector 17',
    addressType: 'BUSINESS',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'IN',
    postalCode: '122001',
  },
  package: {
    weightKg: 1.25,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10,
    pieces: 1,
    itemDescription: 'Cotton shirts',
    itemQuantity: 2,
  },
  payment: {
    mode: 'COD',
    collectableAmount: 1499,
    declaredValue: 1499,
  },
  invoice: {
    number: 'INV-001',
    date: '2026-08-03',
    value: 1499,
  },
};
