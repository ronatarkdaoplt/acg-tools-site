import { ERROR_CODE, SDKError } from '@a42n-olympus/ark-dao-sdk';
import { Accordion, Input, Option, Select } from '@lidofinance/lido-ui';
import { Action } from 'components/action';
import { useArkSDK } from 'providers/sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWeb3 } from 'reef-knot/web3-react';
import {
  Abi,
  AbiFunction,
  Address,
  ContractFunctionParameters,
  getAbiItem,
  zeroAddress,
} from 'viem';

export const ArbitaryFunctionCallDemo = () => {
  const { account: web3account = '0x0' } = useWeb3();
  const account = web3account as `0x${string}`;

  const [inputContractAbi, setInputContractAbi] = useState<string>('');
  const [currentContractAbi, setCurrentContractAbi] = useState<Abi>();
  const {
    currentFunctionAbi,
    setCurrentFunctionAbi,
    renderContractFunctionParamInput,
    contractAddress,
    setContractAddress,
    executeFunctionCall,
  } = useContractFunctionParamInput();

  return (
    <Accordion summary="Contract Function Call">
      <Action
        title="Set Contract ABI"
        action={async () => {
          // parse abi into valid JSON format
          const parsedAbi = JSON.parse(inputContractAbi) as Abi;

          // validate ABI items
          if (
            parsedAbi.every((item) => {
              return (
                item.type &&
                typeof item.type === 'string' &&
                [
                  'function',
                  'constructor',
                  'event',
                  'error',
                  'fallback',
                  'receive',
                ].includes(item.type)
              );
            })
          ) {
            // set current abi
            setCurrentContractAbi(parsedAbi);

            // output current abi
            return parsedAbi;
          } else {
            // abi is invalid
            return {
              error: 'inputted abi is invalid',
            };
          }
        }}
      >
        <Input
          label="Contract ABI"
          value={JSON.stringify(currentContractAbi)}
          onChange={(event) => setInputContractAbi(event.target.value)}
        />
      </Action>
      <Action
        title="Execute Function Call"
        action={async () => executeFunctionCall()}
      >
        {/* contract address */}
        <Input
          label="Contract address"
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value.trim() as Address)}
        ></Input>
        {/* function dropdown */}
        <Select
          label="Contract Function Name"
          onChange={(functionName) => {
            // set function abi
            const abi = getAbiItem({
              abi: currentContractAbi!,
              name: functionName as string,
            }) as AbiFunction;

            setCurrentFunctionAbi(abi);
          }}
        >
          {currentContractAbi &&
            (
              currentContractAbi.filter(
                ({ type }) => type == 'function',
              ) as AbiFunction[]
            )
              // only allow view function for now
              // .filter(
              //   ({ stateMutability }) =>
              //     stateMutability == 'view' || stateMutability == 'pure',
              // )
              // display function names in the dropdown
              .map(({ name }, i) => (
                <Option
                  key={`contractfunctioncall-option-${i}`}
                  value={name}
                  children={name}
                />
              ))}
        </Select>
        {/* function params */}
        {renderContractFunctionParamInput}
      </Action>
    </Accordion>
  );
};

const useContractFunctionParamInput = () => {
  const [currentFunctionAbi, setCurrentFunctionAbi] = useState<AbiFunction>();
  const [contractAddress, setContractAddress] = useState<Address>();
  const [functionArgs, setFunctionArgs] = useState<any[]>([]);
  const { core } = useArkSDK();
  const { account: web3account = zeroAddress } = useWeb3();
  const account = web3account as `0x${string}`;

  useEffect(() => {
    // reset functionArgs
    setFunctionArgs([]);
  }, [currentFunctionAbi]);

  const renderInput = useMemo(() => {
    if (!currentFunctionAbi) return <></>;

    const render = currentFunctionAbi.inputs.map(({ name, type }, argIndex) => (
      <Input
        key={`renderContractFunctionParamInput-${name}`}
        label={name}
        onChange={(e) => {
          const input = e.target.value;
          let args = [...functionArgs];
          const uintType = type.match(/^uint(\d+)$/);

          // assign arg
          if (uintType && Number(uintType[1]) <= 48) {
            args[argIndex] = Number(input);
          } else if (uintType && Number(uintType[1]) > 48) {
            args[argIndex] = BigInt(input);
          } else {
            args[argIndex] = input;
          }

          // set args
          setFunctionArgs(args);
        }}
      ></Input>
    ));

    return render;
  }, [currentFunctionAbi, functionArgs]);

  const executeFunctionCall = useCallback(async () => {
    if (!contractAddress)
      throw new SDKError({
        code: ERROR_CODE.INVALID_ARGUMENT,
        message: 'contract address must be defined',
      });
    if (!currentFunctionAbi)
      throw new SDKError({
        code: ERROR_CODE.INVALID_ARGUMENT,
        message: 'function must be defined',
      });

    const params = {
      abi: [currentFunctionAbi],
      address: contractAddress,
      functionName: currentFunctionAbi.name,
      args: currentFunctionAbi.inputs.length == 0 ? undefined : functionArgs,
    } satisfies ContractFunctionParameters;

    try {
      // read contract
      if (
        currentFunctionAbi.stateMutability == 'pure' ||
        currentFunctionAbi.stateMutability == 'view'
      ) {
        // output data
        return {
          [currentFunctionAbi.name]: await core.rpcProvider.readContract({
            ...params,
          }),
        };
      }

      // simulate contract
      await core.rpcProvider.simulateContract({
        ...params,
        account,
      });

      // write contract
      return {
        txHash: await core.web3Provider!.writeContract({
          ...params,
          chain: core.chain,
          account,
        }),
      };
    } catch (error) {
      throw new SDKError({
        code: ERROR_CODE.TRANSACTION_ERROR,
        error,
        message: (error as Error).message,
      });
    }
  }, [currentFunctionAbi, functionArgs, contractAddress]);

  return {
    currentFunctionAbi,
    setCurrentFunctionAbi,
    renderContractFunctionParamInput: renderInput,
    contractAddress,
    setContractAddress,
    executeFunctionCall,
  };
};
