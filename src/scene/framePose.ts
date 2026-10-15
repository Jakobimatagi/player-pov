import type { BallPose } from '../play/types'

/** Poses from the player frame. The camera reads these and does not sample again. */
export const poseXY = new Float32Array(64)
export const poseHeading = new Float32Array(32)
export const poseVel = new Float32Array(64)
export const publishedBall: BallPose = {
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  carrierIndex: -1,
}
