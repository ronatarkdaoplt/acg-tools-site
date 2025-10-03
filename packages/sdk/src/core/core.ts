import { splitSignature } from '@ethersproject/bytes';
import {
  type Address,
  type Chain,
  type CustomTransportConfig,
  type GetBlockReturnType,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  getContract,
  http,
  JsonRpcAccount,
  maxUint256,
} from 'viem';
import {
  ERROR_CODE,
  invariant,
  invariantArgument,
  withSDKError,
} from '../common/utils/sdk-error.js';

import {
  type CHAINS,
  APPROX_SECONDS_PER_BLOCK,
  ARK_DAO_TOKENS,
  CONTRACTS_BY_CHAIN,
  ARK_CONTRACT_NAMES,
  NOOP,
  PERMIT_MESSAGE_TYPES,
  SUBRGRAPH_ID_BY_CHAIN,
  SUPPORTED_CHAINS,
  VIEM_CHAINS,
} from '../common/constants.js';
import { Cache, Initialize, Logger } from '../common/decorators/index.js';
import { type SDKErrorProps, SDKError } from '../common/utils/index.js';

import { ArkSDKCacheable } from '../common/class-primitives/cacheable.js';
import { permitAbi } from './abi/permit.js';
import type {
  AccountValue,
  BackArgumentType,
  BlockArgumentType,
  GetFeeDataResult,
  ArkSDKCoreProps,
  LOG_MODE,
  PerformTransactionOptions,
  PermitSignature,
  SignPermitProps,
  TransactionOptions,
  TransactionResult,
} from './types.js';
import { TransactionCallbackStage } from './types.js';

export default class ArkSDKCore extends ArkSDKCacheable {
  public static readonly INFINITY_DEADLINE_VALUE = maxUint256;
  private static readonly SECONDS_PER_DAY = 86400n;

  #web3Provider: WalletClient | undefined;

  readonly chainId: CHAINS;
  readonly rpcUrls: string[] | undefined;
  readonly chain: Chain;
  readonly rpcProvider: PublicClient;
  readonly logMode: LOG_MODE;

  public get web3Provider(): WalletClient | undefined {
    return this.#web3Provider;
  }

  constructor(props: ArkSDKCoreProps, version?: string) {
    super();
    this.chainId = props.chainId;
    this.rpcUrls = props.rpcUrls;
    this.logMode = props.logMode ?? 'info';
    // for devnnets actual

    const { chain, rpcProvider, web3Provider } = this.init(props, version);

    this.chain = chain;
    this.rpcProvider = rpcProvider;
    this.#web3Provider = web3Provider;
  }

  // Static Provider Creation

  public static createRpcProvider(
    chainId: CHAINS,
    rpcUrls: string[],
  ): PublicClient {
    const rpcs = rpcUrls.map((url) => http(url));

    return createPublicClient({
      batch: {
        multicall: true,
      },
      chain: VIEM_CHAINS[chainId],
      transport: fallback(rpcs),
    });
  }

  public static createWeb3Provider(
    chainId: CHAINS,
    transport: { request(...args: any): Promise<any> },
    transportConfig?: CustomTransportConfig,
  ): WalletClient {
    return createWalletClient({
      chain: VIEM_CHAINS[chainId],
      transport: custom(transport, transportConfig),
    });
  }

  @Initialize('Init:')
  @Logger('LOG:')
  private init(props: ArkSDKCoreProps, _version?: string) {
    const { chainId, rpcUrls, web3Provider, rpcProvider } = props;
    if (!SUPPORTED_CHAINS.includes(chainId)) {
      throw this.error({
        message: `Unsupported chain: ${chainId}`,
        code: ERROR_CODE.INVALID_ARGUMENT,
      });
    }

    if (!rpcProvider && rpcUrls.length === 0) {
      throw this.error({
        message: `Either rpcProvider or rpcUrls are required`,
        code: ERROR_CODE.INVALID_ARGUMENT,
      });
    }

    const chain = VIEM_CHAINS[chainId];
    const currentRpcProvider =
      rpcProvider ?? ArkSDKCore.createRpcProvider(chainId, rpcUrls);
    const currentWeb3Provider = web3Provider;

    return {
      chain,
      rpcProvider: currentRpcProvider,
      web3Provider: currentWeb3Provider,
    };
  }

  // Web 3 provider

  @Logger('Provider:')
  public useWeb3Provider(): WalletClient {
    invariant(
      this.#web3Provider,
      'Web3 Provider is not defined',
      ERROR_CODE.PROVIDER_ERROR,
    );
    return this.#web3Provider;
  }

  // Balances

  @Logger('Balances:')
  public async balanceETH(address?: AccountValue): Promise<bigint> {
    const parsedAccount = await this.useAccount(address);
    return this.rpcProvider.getBalance({ address: parsedAccount.address });
  }

  // Contracts

  // PERMIT
  @Logger('Permit:')
  public async signPermit(props: SignPermitProps): Promise<PermitSignature> {
    const {
      token,
      amount,
      account: accountProp,
      spender,
      deadline = ArkSDKCore.INFINITY_DEADLINE_VALUE,
    } = props;
    const web3Provider = this.useWeb3Provider();
    const account = await this.useAccount(accountProp);
    const { contract, domain } = await this.getPermitContractData(token);
    const nonce = await contract.read.nonces([account.address]);

    const signature = await web3Provider.signTypedData({
      account,
      domain,
      types: PERMIT_MESSAGE_TYPES,
      primaryType: 'Permit',
      message: {
        owner: account.address,
        spender,
        value: amount,
        nonce,
        deadline,
      },
    });
    const { s, r, v } = splitSignature(signature);

    return {
      v,
      r: r as `0x${string}`,
      s: s as `0x${string}`,
      value: amount,
      deadline,
      nonce,
      chainId: domain.chainId,
      owner: account.address,
      spender,
    };
  }

  // Utils

  @Logger('Utils:')
  @Cache(30 * 60 * 1000, ['chain.id'])
  private async getPermitContractData(token: SignPermitProps['token']) {
    const tokenAddress = this.getContractAddress(token);
    const contract = getContract({
      address: tokenAddress,
      abi: permitAbi,
      client: this.rpcProvider,
    });

    let domain = {
      name: 'Wrapped liquid staked Ether 2.0',
      version: '1',
      chainId: BigInt(this.chain.id),
      verifyingContract: tokenAddress,
    };
    if (token === ARK_DAO_TOKENS.ark) {
      const [name, version, chainId, verifyingContract] =
        await contract.read.eip712Domain();
      domain = {
        name,
        version,
        chainId,
        verifyingContract,
      };
    }
    return {
      contract,
      domain,
    };
  }

  @Logger('Utils:')
  public async getFeeData(): Promise<GetFeeDataResult> {
    // we look back 5 blocks at fees of botton 25% txs
    // if you want to increase maxPriorityFee output increase percentile
    const feeHistory = await this.rpcProvider.getFeeHistory({
      blockCount: 5,
      blockTag: 'pending',
      rewardPercentiles: [25],
    });

    // get average priority fee
    const maxPriorityFeePerGas =
      feeHistory.reward && feeHistory.reward.length > 0
        ? feeHistory.reward
            .map((fees) => (fees[0] ? BigInt(fees[0]) : 0n))
            .reduce((sum, fee) => sum + fee) / BigInt(feeHistory.reward.length)
        : 0n;

    const lastBaseFeePerGas = feeHistory.baseFeePerGas[0]
      ? BigInt(feeHistory.baseFeePerGas[0])
      : 0n;

    // we have to multiply by 2 until we find a reliable way to predict baseFee change
    const maxFeePerGas = lastBaseFeePerGas * 2n + maxPriorityFeePerGas;

    return {
      lastBaseFeePerGas,
      maxPriorityFeePerGas,
      maxFeePerGas,
      gasPrice: maxFeePerGas, // fallback
    };
  }

  @Logger('Deprecation:')
  public async getWeb3Address(accountValue?: AccountValue): Promise<Address> {
    if (typeof accountValue === 'string') return accountValue;
    if (accountValue) return accountValue.address;
    const web3Provider = this.useWeb3Provider();

    if (web3Provider.account) return web3Provider.account.address;

    const [account] = await web3Provider.requestAddresses();
    invariant(
      account,
      'web3provider must have at least 1 account',
      ERROR_CODE.PROVIDER_ERROR,
    );
    return account;
  }

  @Logger('Utils:')
  public async useAccount(
    accountValue?: AccountValue,
  ): Promise<JsonRpcAccount> {
    if (accountValue) {
      if (typeof accountValue === 'string')
        return { address: accountValue, type: 'json-rpc' };
      else return accountValue as JsonRpcAccount;
    }
    if (this.web3Provider) {
      if (!this.web3Provider.account) {
        const [account] = await withSDKError(
          this.web3Provider.requestAddresses(),
          ERROR_CODE.READ_ERROR,
        );
        invariant(
          account,
          'web3provider must have at least 1 account',
          ERROR_CODE.PROVIDER_ERROR,
        );
        this.web3Provider.account = { address: account, type: 'json-rpc' };
      }
      return this.web3Provider.account as unknown as JsonRpcAccount;
    }
    invariantArgument(false, 'No account or web3Provider is available');
  }

  @Logger('Utils:')
  @Cache(60 * 60 * 1000, ['chain.id'])
  public async isContract(address: Address): Promise<boolean> {
    // eth_getCode returns hex string of bytecode at address
    // for accounts it's "0x"
    // for contract it's potentially very long hex (can't be safely&quickly parsed)
    const result = await this.rpcProvider.getCode({ address: address });
    return result ? result !== '0x' : false;
  }

  @Logger('Utils:')
  public error(props: SDKErrorProps): SDKError {
    return new SDKError(props);
  }

  @Logger('Utils:')
  public getContractAddress(contract: ARK_CONTRACT_NAMES): Address {
    invariant(
      CONTRACTS_BY_CHAIN[contract][this.chainId] != undefined,
      `${contract} contract is not defined`,
      ERROR_CODE.NOT_SUPPORTED,
    );

    return CONTRACTS_BY_CHAIN[contract][this.chainId]!;
  }

  @Logger('Utils:')
  @Cache(30 * 60 * 1000, ['chain.id'])
  public getSubgraphId(): string | null {
    const id = SUBRGRAPH_ID_BY_CHAIN[this.chainId] ?? null;
    return id;
  }

  @Cache(30 * 60, ['chain.id'])
  public async getLatestBlockToTimestamp(
    timestamp: bigint,
  ): Promise<GetBlockReturnType<Chain, false, 'latest'>> {
    const now = BigInt(Math.floor(Date.now() / 1000));
    let latestBlock = await this.rpcProvider.getBlock({ blockTag: 'latest' });
    if (latestBlock.timestamp < timestamp) {
      return latestBlock;
    }
    let mid = latestBlock.number - (now - timestamp) / APPROX_SECONDS_PER_BLOCK;
    invariantArgument(mid > 0n, 'No blocks at this timestamp');

    let block = await this.rpcProvider.getBlock({ blockNumber: mid });
    // feeling lucky?
    if (block.timestamp === timestamp) return block;

    const isOverShoot = block.timestamp < timestamp;
    let left = isOverShoot ? block.number : 0n;
    let right = isOverShoot ? latestBlock.number : block.number;

    while (left <= right) {
      mid = (left + right) / 2n;
      block = await this.rpcProvider.getBlock({ blockNumber: mid });
      if (block.timestamp === timestamp) {
        return block;
      } else if (block.timestamp < timestamp) {
        latestBlock = block;
        left = mid + 1n;
      } else {
        right = mid - 1n;
      }
    }
    return latestBlock;
  }

  @Logger('Utils:')
  public async toBlockNumber(arg: BlockArgumentType): Promise<bigint> {
    if (arg.timestamp) {
      const block = await this.getLatestBlockToTimestamp(arg.timestamp);
      return block.number;
    }
    const { block } = arg;
    if (typeof block === 'bigint') return block;
    const { number } = await this.rpcProvider.getBlock({
      blockTag: block,
    });
    invariantArgument(number !== null, 'block must not be pending');
    return number;
  }

  @Logger('Utils:')
  public async toBackBlock(
    arg: BackArgumentType,
    start: bigint,
  ): Promise<bigint> {
    if (arg.blocks) {
      const end = start - arg.blocks;
      invariantArgument(end >= 0n, 'Too many blocks back');
      return end;
    } else {
      const { timestamp: startTimestamp } = await this.rpcProvider.getBlock({
        blockNumber: start,
      });
      const diff = arg.days
        ? arg.days * ArkSDKCore.SECONDS_PER_DAY
        : arg.seconds;
      invariantArgument(diff, 'must have at least something in back argument');
      const endTimestamp = startTimestamp - diff;
      const block = await this.getLatestBlockToTimestamp(endTimestamp);
      return block.number;
    }
  }

  public async performTransaction<TDecodedResult = undefined>(
    props: PerformTransactionOptions<TDecodedResult>,
  ): Promise<TransactionResult<TDecodedResult>> {
    // this guards against not having web3Provider
    this.useWeb3Provider();
    const {
      callback = NOOP,
      sendTransaction,
      decodeResult,
      waitForTransactionReceiptParameters = {},
    } = props;
    const account = await this.useAccount(props.account);
    const isContract = await this.isContract(account.address);

    let overrides: TransactionOptions = {
      account,
      chain: this.chain,
      gas: undefined,
      maxFeePerGas: undefined,
      maxPriorityFeePerGas: undefined,
    };

    const customGas = await callback({
      stage: TransactionCallbackStage.SIGN,
      payload: overrides.gas,
    });

    if (typeof customGas === 'bigint') overrides.gas = customGas;

    const hash = await withSDKError(
      sendTransaction({
        ...overrides,
      }),
      ERROR_CODE.TRANSACTION_ERROR,
    );

    if (isContract) {
      await callback({ stage: TransactionCallbackStage.MULTISIG_DONE });
      return { hash };
    }

    await callback({
      stage: TransactionCallbackStage.RECEIPT,
      payload: hash,
    });

    const receipt = await withSDKError(
      this.rpcProvider.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
        ...waitForTransactionReceiptParameters,
      }),
      ERROR_CODE.TRANSACTION_ERROR,
    );

    await callback({
      stage: TransactionCallbackStage.CONFIRMATION,
      payload: receipt,
    });

    const confirmations = await this.rpcProvider.getTransactionConfirmations({
      hash: receipt.transactionHash,
    });

    const result = await decodeResult?.(receipt);

    await callback({
      stage: TransactionCallbackStage.DONE,
      payload: confirmations,
    });

    return {
      hash,
      receipt,
      result,
      confirmations,
    };
  }
}
