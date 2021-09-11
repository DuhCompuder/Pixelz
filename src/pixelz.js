const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')

const CID = require('cids')
const ipfsClient = require('ipfs-http-client')
const all = require('it-all')
const uint8ArrayConcat = require('uint8arrays/concat')
const uint8ArrayToString = require('uint8arrays/to-string')
const {BigNumber} = require('ethers')


const { loadDeploymentInfo } = require('./deploy')

// The getconfig package loads configuration from files located in the the `config` directory.
// See https://www.npmjs.com/package/getconfig for info on how to override the default config for
// different environments (e.g. testnet, mainnet, staging, production, etc).
const config = require('getconfig')

// ipfs.add parameters for more deterministic CIDs
const ipfsAddOptions = {
  cidVersion: 1,
  hashAlg: 'sha2-256'
}

/**
 * Construct and asynchronously initialize a new Pixelz instance.
 * @returns {Promise<Pixelz>} a new instance of Pixelz, ready to mint NFTs.
 */
 async function MakePixelz() {
    const m = new Pixelz()
    await m.init()
    return m
}

/**
 * Pixelz is the main object responsible for storing NFT data and interacting with the smart contract.
 * Before constructing, make sure that the contract has been deployed and a deployment
 * info file exists (the default location is `pixelz-deployment.json`)
 * 
 * Pixelz requires async initialization, so the Pixelz class (and its constructor) are not exported. 
 * To make one, use the async {@link MakePixelz} function.
 */
class Pixelz {
    constructor() {
        this.ipfs = null
        this.contract = null
        this.deployInfo = null
        this._initialized = false
    }

    async init() {
        if (this._initialized) {
            return
        }
        this.hardhat = require('hardhat')

        // The Pixelz object expects that the contract has already been deployed, with
        // details written to a deployment info file. The default location is `./pixelz-deployment.json`,
        // in the config.
        this.deployInfo = await loadDeploymentInfo()

        // connect to the smart contract using the address and ABI from the deploy info
        const {abi, address} = this.deployInfo.contract
        this.contract = await this.hardhat.ethers.getContractAt(abi, address)

        // create a local IPFS node
        this.ipfs = ipfsClient(config.ipfsApiUrl)

        this._initialized = true
    }


    //////////////////////////////////////////////
    // ------ NFT Creation
    //////////////////////////////////////////////

    /**
     * Create a new NFT from the given asset data.
     * 
     * @param {Buffer|Uint8Array} content - a Buffer or UInt8Array of data (e.g. for an image)
     * @param {object} options
     * @param {?string} path - optional file path to set when storing the data on IPFS
     * @param {?string} name - optional name to set in NFT metadata
     * @param {?string} description - optional description to store in NFT metadata
     * @param {?string} owner - optional ethereum address that should own the new NFT. 
     * If missing, the default signing address will be used.
     * 
     * @typedef {object} CreateNFTResult
     * @property {string} tokenId - the unique ID of the new token
     * @property {string} ownerAddress - the ethereum address of the new token's owner
     * @property {object} metadata - the JSON metadata stored in IPFS and referenced by the token's metadata URI
     * @property {string} metadataURI - an ipfs:// URI for the NFT metadata
     * @property {string} metadataGatewayURL - an HTTP gateway URL for the NFT metadata
     * @property {string} assetURI - an ipfs:// URI for the NFT asset
     * @property {string} assetGatewayURL - an HTTP gateway URL for the NFT asset
     * 
     * @returns {Promise<CreateNFTResult>}
     */
     async createNFTFromAssetData(content, options) {
        // assign or create a new directory to store all nft data to a server location
        const __dirname = './nft';

        if (!fs.existsSync(__dirname)){
            fs.mkdirSync(__dirname);
        }
        let tokenId;
        //Mod this for multiples
        tokenId = await this.contract.totalSupply()
        //Add data to Server
        await fsp.writeFile(__dirname + `/${tokenId + 1}`, content)
        const filePath = options.path || 'asset.bin'
        const basename = path.basename(filePath)
        //location of nft image file
        const assetURI = __dirname + basename
        // make the NFT metadata JSON
        const metadata = await this.makeNFTMetadata(assetURI, options)

        const metadataURI = __dirname + `/${tokenId}-` + 'metadata.json'
        await fsp.writeFile(metadataURI, JSON.stringify(metadata))

        // get the address of the token owner from options, or use the default signing address if no owner is given
        let ownerAddress = options.owner
        if (!ownerAddress) {
            ownerAddress = await this.defaultOwnerAddress()
        }

        // mint a new token referencing the metadata URI
        tokenId = await this.purchasePixelzNFT(ownerAddress, metadataURI)

        // format and return the results
        return {
            tokenId,
            ownerAddress,
            metadata,
            assetURI,
            metadataURI,
            assetGatewayURL: makeGatewayURL(assetURI),
            metadataGatewayURL: makeGatewayURL(metadataURI),
        }
    }
        /**
     * Create a new NFT from an asset file at the given path.
     * 
     * @param {string} filename - the path to an image file or other asset to use
     * @param {object} options
     * @param {?string} name - optional name to set in NFT metadata
     * @param {?string} description - optional description to store in NFT metadata
     * @param {?string} owner - optional ethereum address that should own the new NFT. 
     * If missing, the default signing address will be used.
     * 
     * @returns {Promise<CreateNFTResult>}
     */
    async createNFTFromAssetFile(filename, options) {
        const content = await fsp.readFile(filename)
        return this.createNFTFromAssetData(content, {...options, path: filename})
    }
    
    /**
     * Helper to construct metadata JSON for 
     * @param {string} assetCid - IPFS URI for the NFT asset
     * @param {object} options
     * @param {?string} name - optional name to set in NFT metadata
     * @param {?string} description - optional description to store in NFT metadata
     * @returns {object} - NFT metadata object
     */
    async makeNFTMetadata(assetURI, options) {
        const {name, description} = options;
        // assetURI = ensureIpfsUriPrefix(assetURI) //uncomment for IPFS
        return {
            name,
            description,
            image: assetURI
        }
    }
    // //////////////////////////////////////////////
    // // --------- Smart contract interactions
    // //////////////////////////////////////////////
    
    //////////////////////////////////////////////
    // --------- Modified Smart contract interactions
    //////////////////////////////////////////////

    /**
     * Returns all user owned Pixelz NFTs by index
     * 
     * @param {string} ownerAddress - the ethereum address that owns Pixelz
     * @returns {Promise<array>} - URIs of all pixelz owned
     */
     async getOwnedPixelz(ownerAddress) {
        const tokensByIndex = await this.contract.tokensOfOwner(ownerAddress);
        return tokensByIndex;
    }

    // get price for Pixels based on current supply
    async fetchPriceOnSupply() {
        const price = await this.contract.calculatePrice()
        let priceInEth;
        priceInEth = ( price / 18 ).toFixed(6);
        return priceInEth;
    }

    // get price for Pixels based on token id
    async fetchPriceOnTokenId(id) {
        const price = await this.contract.calculatePriceForToken(id)
        let priceInEth;
        priceInEth = ( price / 18 ).toFixed(6);
        return priceInEth;
    }

    // purchasing Pixelz with max number of 20
    async purchasePixelzNFT(num) {
        if (num > 20 || num < 1) {
            throw 'Number must be between 1 to 20 inclusive';
        }
        const tx = await this.contract.adoptPixelz(num)
        const receipt = await tx.wait()
        
        for (const event of receipt.events) {
            if (event.event !== 'Transfer') {
                console.log('ignoring unknown event type ', event.event)
                continue
            }
            return event.args.tokenId.toString()
        }

        throw new Error('unable to get token id')
    }
///////////////////////////////////////////////////////////////////////////
    async transferToken(tokenId, toAddress) {
        const fromAddress = await this.getTokenOwner(tokenId)

        // because the base ERC721 contract has two overloaded versions of the safeTranferFrom function,
        // we need to refer to it by its fully qualified name.
        const tranferFn = this.contract['safeTransferFrom(address,address,uint256)']
        const tx = await tranferFn(fromAddress, toAddress, tokenId)

        // wait for the transaction to be finalized
        await tx.wait()
    }

    /**
     * @returns {Promise<string>} - the default signing address that should own new tokens, if no owner was specified.
     */
    async defaultOwnerAddress() {
        const signers = await this.hardhat.ethers.getSigners()
        return signers[0].address
    }

    /**
     * Get the address that owns the given token id.
     * 
     * @param {string} tokenId - the id of an existing token
     * @returns {Promise<string>} - the ethereum address of the token owner. Fails if no token with the given id exists.
     */
    async getTokenOwner(tokenId) {
        return this.contract.ownerOf(tokenId)
    }

    /**
     * Get historical information about the token.
     * 
     * @param {string} tokenId - the id of an existing token
     * 
     * @typedef {object} NFTCreationInfo
     * @property {number} blockNumber - the block height at which the token was minted
     * @property {string} creatorAddress - the ethereum address of the token's initial owner
     * 
     * @returns {Promise<NFTCreationInfo>}
     */
    async getCreationInfo(tokenId) {
        const filter = await this.contract.filters.Transfer(
            null,
            null,
            BigNumber.from(tokenId)
        )

        const logs = await this.contract.queryFilter(filter)
        const blockNumber = logs[0].blockNumber
        const creatorAddress = logs[0].args.to
        return {
            blockNumber,
            creatorAddress,
        }
    }

    //////////////////////////////////////////////
    // --------- Owner Only Contract Functions
    //////////////////////////////////////////////
    
    async setProvenanceHash(hash) {
        const tx = await this.contract.setProvenanceHash(hash);
        await tx.wait()
    }
    async setBaseURI(baseURI) {
        const tx = await this.contract.setBaseURI(baseURI);
        await tx.wait()
    }
    async startSale() {
        console.log("starting soon..")
        const tx = await this.contract.startSale();
        const receipt = await tx.wait()
        let status = await this.contract.hasSaleStarted();
        console.log("status: ", status)
        return receipt
    }
    async stopSale() {
        const tx = await this.contract.pauseSale();
        await tx.wait()
    }
    async withdrawAll() {
        const tx = await this.contract.withdrawAll();
        await tx.wait()
    }
    async reserveGiveaway(num) {
        const tx = await this.contract.reserveGiveaway(num);
        await tx.wait()
    }
}


module.exports = {
    MakePixelz,
}