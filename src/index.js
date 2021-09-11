#!/usr/bin/env node

// This file contains the main entry point for the command line `pixelz` app, and the command line option parsing code.
// See pixelz.js for the core functionality.

const fs = require('fs/promises')
const path = require('path')
const {Command} = require('commander')
const inquirer = require('inquirer')
const chalk = require('chalk')
const colorize = require('json-colorizer')
const config = require('getconfig')

const { MakePixelz } = require('./pixelz')

const {deployContract, saveDeploymentInfo} = require('./deploy')

const colorizeOptions = {
    pretty: true,
    colors: {
        STRING_KEY: 'blue.bold',
        STRING_LITERAL: 'green'
    }
}

async function main() {
    const program = new Command()

    // commands
    program
    /*
     * *********************************
     * 
     *      NEW COMMAND INSERTIONS
     * 
     * *********************************
    */
    //Deploy New Commands // ----------------------------------------------------------------
        .command('adopt <image-path>')
        .description('adopt a new Pixelz nft')
        .option('-p, --pay <eth>', 'amount in eth')
        .action(adoptPixelz)
    program
        .command('start-sale')
        .description('Begin Pixelz sales')
        .action(startSale)
    program
        .command('pause-sale')
        .description('Pause Pixelz sales')
        .action(stopSale)
    // New Deploy
    program.command('deploy')
        .description('deploy an instance of the Pixelz NFT contract')
        .option('-o, --output <deploy-file-path>', 'Path to write deployment info to', config.deploymentConfigFile || 'pixelz-deployment.json')
        .option('-u, --baseURI <baseURI>', 'Set the initial baseURI', 'ipfs://')
        .action(deploy)
    //Deploy New Commands // ----------------------------------------------------------------

    // The hardhat and getconfig modules both expect to be running from the root directory of the project,
    // so we change the current directory to the parent dir of this script file to make things work
    // even if you call pixelz from elsewhere
    const rootDir = path.join(__dirname, '..')
    process.chdir(rootDir)

    await program.parseAsync(process.argv)
}
// ---- additional command action functions
async function startSale() {
    const pixelz = await MakePixelz()
    console.log(`Starting the sale...`)
    let status = await pixelz.startSale();
    console.log(status)
}
async function stopSale() {
    const pixelz = await MakePixelz()
    console.log(`Pausing the sale...`)
    await pixelz.pauseSale();
}
async function adoptPixelz() {
    
    const pixelz = await MakePixelz()
   
}


// ---- command action functions

async function createNFT(imagePath, options) {
    const pixelz = await MakePixelz()

    // prompt for missing details if not provided as cli args
    const answers = await promptForMissing(options, {
        name: {
            message: 'Enter a name for your new NFT: '
        },

        description: {
            message: 'Enter a description for your new NFT: '
        }
    })

    const nft = await pixelz.createNFTFromAssetFile(imagePath, answers)
    console.log('🌿 Minted a new NFT: ')

    alignOutput([
        ['Token ID:', chalk.green(nft.tokenId)],
        ['Metadata Address:', chalk.blue(nft.metadataURI)],
        ['Metadata Gateway URL:', chalk.blue(nft.metadataGatewayURL)],
        ['Asset Address:', chalk.blue(nft.assetURI)],
        ['Asset Gateway URL:', chalk.blue(nft.assetGatewayURL)],
    ])
    console.log('NFT Metadata:')
    console.log(colorize(JSON.stringify(nft.metadata), colorizeOptions))
}

async function getNFT(tokenId, options) {
    const { creationInfo: fetchCreationInfo } = options
    const pixelz = await MakePixelz()
    const nft = await pixelz.getNFT(tokenId, {fetchCreationInfo})

    const output = [
        ['Token ID:', chalk.green(nft.tokenId)],
        ['Owner Address:', chalk.yellow(nft.ownerAddress)],
    ]
    if (nft.creationInfo) {
        output.push(['Creator Address:', chalk.yellow(nft.creationInfo.creatorAddress)])
        output.push(['Block Number:', nft.creationInfo.blockNumber])
    }
    output.push(['Metadata Address:', chalk.blue(nft.metadataURI)])
    output.push(['Metadata Gateway URL:', chalk.blue(nft.metadataGatewayURL)])
    output.push(['Asset Address:', chalk.blue(nft.assetURI)])
    output.push(['Asset Gateway URL:', chalk.blue(nft.assetGatewayURL)])
    alignOutput(output)

    console.log('NFT Metadata:')
    console.log(colorize(JSON.stringify(nft.metadata), colorizeOptions))
}

async function transferNFT(tokenId, toAddress) {
    const pixelz = await MakePixelz()

    await pixelz.transferToken(tokenId, toAddress)
    console.log(`🌿 Transferred token ${chalk.green(tokenId)} to ${chalk.yellow(toAddress)}`)
}

async function pinNFTData(tokenId) {
    const pixelz = await MakePixelz()
    const {assetURI, metadataURI} = await pixelz.pinTokenData(tokenId)
    console.log(`🌿 Pinned all data for token id ${chalk.green(tokenId)}`)
}

async function deploy(options) {
    const filename = options.output
    const info = await deployContract(options.name, options.symbol, options.baseURI)
    await saveDeploymentInfo(info, filename)
}

// ---- helpers

async function promptForMissing(cliOptions, prompts) {
    const questions = []
    for (const [name, prompt] of Object.entries(prompts)) {
        prompt.name = name
        prompt.when = (answers) => {
            if (cliOptions[name]) {
                answers[name] = cliOptions[name]
                return false
            }
            return true
        }
        questions.push(prompt)
    }
    return inquirer.prompt(questions)
}

function alignOutput(labelValuePairs) {
    const maxLabelLength = labelValuePairs
      .map(([l, _]) => l.length)
      .reduce((len, max) => len > max ? len : max)
    for (const [label, value] of labelValuePairs) {
        console.log(label.padEnd(maxLabelLength+1), value)
    }
}

// ---- main entry point when running as a script

// make sure we catch all errors
main().then(() => {
    process.exit(0)
}).catch(err => {
    console.error(err)
    process.exit(1)
})
