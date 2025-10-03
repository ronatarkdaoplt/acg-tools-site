/** @type Record<number,string> */
export const rpcProviderUrls = {
  // bsc
  56: process.env[`RPC_PROVIDER_URL_56`],
};
/** @type number */
export const defaultChain = parseInt(process.env.DEFAULT_CHAIN, 10) || 560048;
/** @type number[] */
export const supportedChains = process.env?.SUPPORTED_CHAINS?.split(',').map(
  (chainId) => parseInt(chainId, 10),
) ?? [56, 97];
export const walletconnectProjectId = process.env.WALLETCONNECT_PROJECT_ID;
export const backendApiBaseURL = 'https://api.jkci19cn3kd.org/';
