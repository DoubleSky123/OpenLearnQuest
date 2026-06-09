/**
 * AdaptiveEngine
 *
 * Single source of truth for how the game behaves at each emotional state.
 * Call getAdaptiveConfig(emotion) to get the full behavior spec for that state.
 *
 * Designed for progressive enhancement:
 * - Phase 0 (Week 2): pet messages + tutorial links + difficulty modifier are wired up
 * - Phase 1 (Week 3-5): same config keys consumed by sensor-fusion layer
 * - Phase 2 (Week 6-8): same config keys consumed by AI detection layer
 */

export const EMOTIONS = {
  STRESSED: 'stressed',
  OK:       'ok',
  BORED:    'bored',
};

/**
 * Returns the adaptive behavior configuration for the given emotion.
 * @param {string} emotion — one of EMOTIONS values
 * @returns {AdaptiveConfig}
 */
export function getAdaptiveConfig(emotion) {
  switch (emotion) {

    case EMOTIONS.BORED:
      return {
        emotion:              EMOTIONS.BORED,
        label:                'Bored',

        // Difficulty
        difficultyModifier:   1.5,   // scale up question complexity
        skipEasyQuestions:    true,  // auto-advance past beginner subs
        timerPressure:        'high',// tighter timer targets for bonus XP

        // UI features
        showJeopardyBonus:    true,  // unlock Jeopardy bonus challenge component (Week 2)
        showTutorialLinks:    false,
        encouragingMessages:  false,

        // Pet companion speech (used by GamePetCard in Week 2)
        petMessages: [
          "Let's kick it up a notch! ⚡",
          "Too easy? Bonus challenge unlocked!",
          "Speed round — can you keep up?",
          "Push through! You've got this!",
          "Level up your game! 🚀",
        ],

        // Visual accent for UI chrome
        accentColor: '#F59E0B',
        accentLabel: 'Challenge Mode',
      };

    case EMOTIONS.STRESSED:
      return {
        emotion:              EMOTIONS.STRESSED,
        label:                'Stressed',

        // Difficulty
        difficultyModifier:   0.8,   // slightly easier scoring thresholds
        skipEasyQuestions:    false,
        timerPressure:        'low', // timer still runs but penalty is reduced

        // UI features
        showJeopardyBonus:    false,
        showTutorialLinks:    true,  // surface slide/tutorial links overlay (Week 2)
        encouragingMessages:  true,  // extra encouragement banners

        // Pet companion speech
        petMessages: [
          "Take a deep breath — you've got this! 🌟",
          "No rush, we'll figure this out together.",
          "One step at a time. You're doing great!",
          "Mistakes are how we learn. Keep going!",
          "I believe in you! Go at your own pace. 💙",
        ],

        accentColor: '#3B82F6',
        accentLabel: 'Relaxed Mode',
      };

    default: // EMOTIONS.OK
      return {
        emotion:              EMOTIONS.OK,
        label:                'Doing OK',

        difficultyModifier:   1.0,
        skipEasyQuestions:    false,
        timerPressure:        'normal',

        showJeopardyBonus:    false,
        showTutorialLinks:    false,
        encouragingMessages:  false,

        petMessages: [
          "You're in the zone! Keep it up! ✨",
          "Solid work — keep the momentum going.",
          "Nice! That's exactly right.",
          "Perfect pointer logic! 🎯",
          "You're getting really good at this!",
        ],

        accentColor: '#7C3AED',
        accentLabel: 'Normal Mode',
      };
  }
}

/**
 * Returns a random pet message for the current emotion config.
 * @param {AdaptiveConfig} config
 * @returns {string}
 */
export function getRandomPetMessage(config) {
  const msgs = config?.petMessages ?? [];
  if (!msgs.length) return '';
  return msgs[Math.floor(Math.random() * msgs.length)];
}

/**
 * @typedef {Object} AdaptiveConfig
 * @property {string}   emotion
 * @property {string}   label
 * @property {number}   difficultyModifier
 * @property {boolean}  skipEasyQuestions
 * @property {'low'|'normal'|'high'} timerPressure
 * @property {boolean}  showJeopardyBonus
 * @property {boolean}  showTutorialLinks
 * @property {boolean}  encouragingMessages
 * @property {string[]} petMessages
 * @property {string}   accentColor
 * @property {string}   accentLabel
 */
