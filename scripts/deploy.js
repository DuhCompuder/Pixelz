const hre = require("hardhat");
// const fs = require('fs');

async function main() {
  const Pixelz = await hre.ethers.getContractFactory("Pixelz");
  const pixelz = await Pixelz.deploy("ipfs://");
  await pixelz.deployed();
  console.log("Pixelz deployed to:", pixelz.address);

//   let config = `
//   export const nftmarketaddress = "${nftMarket.address}"
//   export const nftaddress = "${nft.address}"
//   `

//   let data = JSON.stringify(config)
//   fs.writeFileSync('config.js', JSON.parse(data))

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

  // const pixelz = await (await ethers.getContractFactory("Pixelz")).attach("0x5fbdb2315678afecb367f032d93f642f64180aa3")

//   'MAX_PIXELZ()': [Function (anonymous)],
//   'METADATA_PROVENANCE_HASH()': [Function (anonymous)],
//   'R()': [Function (anonymous)],
//   'adoptPixelz(uint256)': [Function (anonymous)],
//   'approve(address,uint256)': [Function (anonymous)],
//   'balanceOf(address)': [Function (anonymous)],
//   'baseURI()': [Function (anonymous)],
//   'calculatePrice()': [Function (anonymous)],
//   'calculatePriceForToken(uint256)': [Function (anonymous)],
//   'getApproved(uint256)': [Function (anonymous)],
//   'hasSaleStarted()': [Function (anonymous)],
//   'isApprovedForAll(address,address)': [Function (anonymous)],
//   'name()': [Function (anonymous)],
//   'owner()': [Function (anonymous)],
//   'ownerOf(uint256)': [Function (anonymous)],
//   'pauseSale()': [Function (anonymous)],
//   'renounceOwnership()': [Function (anonymous)],
//   'reserveGiveaway(uint256)': [Function (anonymous)],
//   'safeTransferFrom(address,address,uint256)': [Function (anonymous)],      
//   'safeTransferFrom(address,address,uint256,bytes)': [Function (anonymous)],  'setApprovalForAll(address,bool)': [Function (anonymous)],
//   'setBaseURI(string)': [Function (anonymous)],
//   'setProvenanceHash(string)': [Function (anonymous)],
//   'startSale()': [Function (anonymous)],
//   'supportsInterface(bytes4)': [Function (anonymous)],
//   'symbol()': [Function (anonymous)],
//   'tokenByIndex(uint256)': [Function (anonymous)],
//   'tokenOfOwnerByIndex(address,uint256)': [Function (anonymous)],
//   'tokenURI(uint256)': [Function (anonymous)],
//   'tokensOfOwner(address)': [Function (anonymous)],
//   'totalSupply()': [Function (anonymous)],
//   'transferFrom(address,address,uint256)': [Function (anonymous)],
//   'transferOwnership(address)': [Function (anonymous)],
//   'withdrawAll()': [Function (anonymous)],