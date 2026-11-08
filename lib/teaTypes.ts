// Tea types offered by the admin form and the request form.
export const TEA_TYPES = [
  'Green',
  'Black',
  'Oolong',
  'White',
  'Pu-erh',
  'Yellow',
  'Herbal',
  'Rooibos',
] as const
export type TeaType = (typeof TEA_TYPES)[number]
