import { Address, Hash } from 'viem';
import { CommonTransactionProps } from '../core/types.js';

// genesis node admin

export type AccessControlProps = CommonTransactionProps & {
  roleHash: Hash;
  contractAddress: Address;
  givenAddress: Address;
};
