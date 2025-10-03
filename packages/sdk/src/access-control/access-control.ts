import {
  Address,
  getContract,
  JsonRpcAccount,
  WalletClient,
  WriteContractParameters,
} from 'viem';
import { NOOP } from '../common/constants.js';
import { ErrorHandler, Logger } from '../common/decorators/index.js';
import { CommonTransactionProps, TransactionResult } from '../core/types.js';

import { ArkSDKModule } from '../common/class-primitives/sdk-module.js';
import { AccessControl } from './abi/AccessControl.js';
import type { AccessControlProps } from './types.js';

export class ArkSDKAccessControl extends ArkSDKModule {
  // Precomputed event signatures

  // Calls

  @Logger('Call:')
  @ErrorHandler()
  public async grantRole(
    props: AccessControlProps,
    simulateOnly = false,
  ): Promise<WriteContractParameters | TransactionResult> {
    this.core.useWeb3Provider();
    // parse tx props
    const {
      callback,
      account,
      waitForTransactionReceiptParameters,
      contractAddress,
      roleHash,
      givenAddress: grantToAddress,
    } = await this.parseTxProps(props);
    const contract = await this.getContractFromAddress(contractAddress);

    // simulate tx
    const { request } = await contract.simulate.grantRole(
      [roleHash, grantToAddress],
      { account },
    );

    if (simulateOnly != undefined && simulateOnly == true) {
      return request;
    }

    // send tx
    return this.core.performTransaction({
      waitForTransactionReceiptParameters,
      callback,
      account,
      sendTransaction: (options) =>
        contract.write.grantRole([roleHash, grantToAddress], {
          ...options,
        }),
    });
  }

  @Logger('Call:')
  @ErrorHandler()
  public async revokeRole(
    props: AccessControlProps,
    simulateOnly = false,
  ): Promise<WriteContractParameters | TransactionResult> {
    this.core.useWeb3Provider();
    // parse tx props
    const {
      callback,
      account,
      waitForTransactionReceiptParameters,
      contractAddress,
      roleHash,
      givenAddress: revokeFromAddress,
    } = await this.parseTxProps(props);
    const contract = await this.getContractFromAddress(contractAddress);

    // simulate tx
    const { request } = await contract.simulate.revokeRole(
      [roleHash, revokeFromAddress],
      { account },
    );

    if (simulateOnly != undefined && simulateOnly == true) {
      return request;
    }

    // send tx
    return this.core.performTransaction({
      waitForTransactionReceiptParameters,
      callback,
      account,
      sendTransaction: (options) =>
        contract.write.revokeRole([roleHash, revokeFromAddress], {
          ...options,
        }),
    });
  }

  @Logger('Call:')
  @ErrorHandler()
  public async renounceRole(
    props: Omit<AccessControlProps, 'givenAddress'>,
    simulateOnly = false,
  ): Promise<WriteContractParameters | TransactionResult> {
    this.core.useWeb3Provider();
    // parse tx props
    const {
      callback,
      account,
      waitForTransactionReceiptParameters,
      contractAddress,
      roleHash,
    } = await this.parseTxProps(props);
    const contract = await this.getContractFromAddress(contractAddress);

    // simulate tx
    const { request } = await contract.simulate.renounceRole(
      [roleHash, account.address],
      { account },
    );

    if (simulateOnly != undefined && simulateOnly == true) {
      return request;
    }

    // send tx
    return this.core.performTransaction({
      waitForTransactionReceiptParameters,
      callback,
      account,
      sendTransaction: (options) =>
        contract.write.renounceRole([roleHash, account.address], {
          ...options,
        }),
    });
  }

  private async parseTxProps<T extends CommonTransactionProps>(
    props: T,
  ): Promise<Omit<T, 'account'> & { account: JsonRpcAccount }> {
    return {
      ...props,
      account: await this.core.useAccount(props.account),
      callback: props.callback ?? NOOP,
    };
  }

  private async getContractFromAddress(contractAddress: Address) {
    return getContract({
      abi: AccessControl,
      address: contractAddress,
      client: {
        public: this.core.rpcProvider,
        wallet: this.core.web3Provider as WalletClient,
      },
    });
  }
}
