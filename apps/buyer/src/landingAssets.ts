export const factoryAssetManifest = {
  robotArm: "./assets/models/kenney-factory/robot-arm-a.glb",
  scanner: "./assets/models/kenney-factory/scanner-high.glb",
  conveyor: "./assets/models/kenney-factory/conveyor-long-stripe-sides.glb",
  shippingBox: "./assets/models/kenney-factory/box-large.glb",
  shippingBoxWide: "./assets/models/kenney-factory/box-wide.glb",
  catwalkStairs: "./assets/models/kenney-factory/catwalk-stairs.glb",
  catwalkStraight: "./assets/models/kenney-factory/catwalk-straight.glb",
  pipeBend: "./assets/models/kenney-factory/pipe-large-bend.glb",
  pipeLong: "./assets/models/kenney-factory/pipe-large-long.glb",
  machineWindow: "./assets/models/kenney-factory/machine-window.glb",
  dockDoor: "./assets/models/kenney-factory/structure-doorway-wide.glb",
  beacon: "./assets/models/kenney-factory/warning-orange.glb",
  deliveryVan: "./assets/models/kenney-car/delivery.glb",
  pallet: "./assets/models/poly-pizza/pallet-quaternius.glb",
  shelf: "./assets/models/poly-pizza/shelf-creativetrio.glb",
} as const;

export type FactoryAssetId = keyof typeof factoryAssetManifest;
