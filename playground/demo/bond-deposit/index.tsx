import { Accordion, Input } from '@lidofinance/lido-ui';
import { Action } from 'components/action';
import { DEFAULT_VALUE, ValueType } from 'components/tokenInput';
import TokenInput from 'components/tokenInput/tokenInput';
import { useArkSDK } from 'providers/sdk';
import { useState } from 'react';
import { useWeb3 } from 'reef-knot/web3-react';
import { transactionToast } from 'utils/transaction-toast';

export const BondDepositDemo = () => {
  const { account: web3account = '0x0' } = useWeb3();
  const [depositValueState, setDepositValue] =
    useState<ValueType>(DEFAULT_VALUE);
  const [modeIdState, setModeId] = useState<number>(0);
  const { bondDeposit, views } = useArkSDK();

  const account = web3account as `0x{string}`;

  return (
    <Accordion summary="Execute Bond">
      <Action
        title="Deposit"
        walletAction
        action={() => {
          const depositValue = depositValueState ?? BigInt(0);
          const modeId = BigInt(modeIdState) ?? BigInt(0);

          bondDeposit.deposit({
            depositValue,
            modeId,
            account,
            callback: transactionToast,
          });
        }}
      >
        <TokenInput
          label="depositValue"
          value={depositValueState}
          placeholder="0.0"
          onChange={setDepositValue}
        />
        <Input
          label="modeId"
          placeholder="0"
          value={modeIdState}
          onChange={(e) => {
            const input =
              e.currentTarget.value == ''
                ? 0
                : parseInt(e.currentTarget.value, 10);
            if (!isNaN(input)) {
              setModeId(input);
            }
          }}
        />
      </Action>
      {/* <Action
        title="Deposit Populate TX"
        walletAction
        action={() => {
          const depositValue = depositValueState ?? BigInt(0);
          const modeId = BigInt(modeIdState) ?? BigInt(0);

          bondDeposit.depositPopulateTx({
            account,
            depositValue,
            modeId,
          });
        }}
      /> */}
      <Action
        title="Deposit Simulate Tx"
        walletAction
        action={() => {
          const depositValue = depositValueState ?? BigInt(0);
          const modeId = BigInt(modeIdState) ?? BigInt(0);

          bondDeposit.depositSimulateTx({
            account,
            depositValue,
            modeId,
          });
        }}
      />
      {/* <Action title="Deposit Limit" action={() => LPBonding.getStakeLimitInfo()} /> */}
      <Action
        title="Address LPBonding"
        action={() => bondDeposit.contractAddressLPBonding()}
      />
      <Action
        title="Address Operator"
        action={() => bondDeposit.getContractOlyV3Operator().address}
      />
      <Action
        title="Get Contract deposit"
        action={async () => bondDeposit.getContractLPBonding().abi}
      />
      <Action title="Get Modes" action={async () => views.getAllModes()} />
      <Action
        title="Get Active Modes"
        action={async () => views.getAllActiveModes()}
      />
      <Action
        title="Get Address Config"
        action={async () =>
          bondDeposit.getContractLPBonding().read.getAddressConfig()
        }
      />
      <Action
        title="Get LPBonding Config"
        action={async () => bondDeposit.getContractLPBonding().read.getConfig()}
      />
    </Accordion>
  );
};
