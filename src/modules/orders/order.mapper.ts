import type { CreateShipmentInput } from '../couriers/courier.types.js';
import type { CreateOrderRequest } from './order.schema.js';

export function toCreateShipmentInput(request: CreateOrderRequest): CreateShipmentInput {
  return {
    orderId: request.order_id,
    serviceLevel: request.service_level,
    consignee: toAddress(request.consignee),
    shipper: toAddress(request.shipper),
    returnAddress: toAddress(request.return_address ?? request.shipper),
    package: {
      weightKg: request.package.weight_kg,
      lengthCm: request.package.length_cm,
      widthCm: request.package.width_cm,
      heightCm: request.package.height_cm,
      pieces: request.package.pieces,
      itemDescription: request.package.item_description,
      itemQuantity: request.package.item_quantity,
    },
    payment: {
      mode: request.payment.mode,
      collectableAmount: request.payment.collectable_amount,
      declaredValue: request.payment.declared_value,
    },
    invoice: {
      number: request.invoice.number,
      date: request.invoice.date,
      value: request.invoice.value,
    },
  };
}

function toAddress(address: CreateOrderRequest['consignee']): CreateShipmentInput['consignee'] {
  return {
    name: address.name,
    phone: address.phone,
    addressLine1: address.address_line_1,
    addressType: address.address_type,
    city: address.city,
    state: address.state,
    country: address.country,
    postalCode: address.postal_code,
    ...(address.email ? { email: address.email } : {}),
    ...(address.address_line_2 ? { addressLine2: address.address_line_2 } : {}),
  };
}
