import { ArbitaryFunctionCallDemo } from './arbitary-function-call';
import { BondDepositDemo } from './bond-deposit';
import { BondRedeemDemo } from './bond-redeem';
import { PancakeSwapDemo } from './pancakeswap-trade';
import { StakeClaimDemo } from './stake-claim';
import { StakeDepositDemo } from './stake-deposit';

export const Demo = () => {
  return (
    <>
      <ArbitaryFunctionCallDemo />
      <PancakeSwapDemo />
      <BondDepositDemo />
      <BondRedeemDemo />
      <StakeDepositDemo />
      <StakeClaimDemo />
    </>
  );
};
