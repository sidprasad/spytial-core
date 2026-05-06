/**
 * Re-exports the four sequence policies from spytial-core's source tree.
 * No new policies invented here.
 */
export {
  ignoreHistory,
  stability,
  changeEmphasis,
  randomPositioning,
  getSequencePolicy,
  type SequencePolicy,
} from '../../src/translators/webcola/sequence-policy';
