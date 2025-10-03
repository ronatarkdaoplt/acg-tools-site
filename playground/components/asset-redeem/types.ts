import { TransformedBondData } from 'extends/ark-dao-frontend/src/types/bond';

export type PartialTransformedBondData = Pick<
  TransformedBondData,
  'id' | 'period' | 'title' | 'capital' | 'redeemable_capital'
>;
