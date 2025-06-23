// src/rules.js
// Constants
const RED_SUITS = ['H', 'D'];
const BLACK_SUITS = ['S', 'C'];
const ACE_VALUE = 15;
const SPADES_SUIT = 'S';
const RED_JOKER = 'R';
const BLACK_JOKER = 'B';
const PENALTY_CARD_VALUES = [2, 3];

// Next action types
const NextActionType = {
  INVALID_MOVE: 'INVALID_MOVE',
  PLAY_CARD: 'PLAY_CARD',
  CHOOSE_SUIT: 'CHOOSE_SUIT',
  APPLY_PENALTY: 'APPLY_PENALTY',
  SKIP_TURN: 'SKIP_TURN',
  END_TURN: 'END_TURN',
  REDUCE_PENALTY: 'REDUCE_PENALTY',
  TRANSFER_PENALTY: 'TRANSFER_PENALTY'
};

function isSameColor(suitA, suitB) {
  if (!suitA || !suitB) return false;
  return (
    (RED_SUITS.includes(suitA) && RED_SUITS.includes(suitB)) ||
    (BLACK_SUITS.includes(suitA) && BLACK_SUITS.includes(suitB))
  );
}

function isValidJokerMove(card, prevCard) {
  // Red joker rules
  if (card.s === RED_JOKER && RED_SUITS.includes(prevCard.s)) return true;
  if (prevCard.s === RED_JOKER && RED_SUITS.includes(card.s)) return true;

  // Black joker rules
  if (card.s === BLACK_JOKER && BLACK_SUITS.includes(prevCard.s)) return true;
  if (prevCard.s === BLACK_JOKER && BLACK_SUITS.includes(card.s)) return true;

  return false;
}

function isMasterCard(card) {
  return (card.v === ACE_VALUE && card.s === SPADES_SUIT);
}

function isAce(card) {
  return (card.v === ACE_VALUE);
}

function isPenaltyCard(card) {
  return PENALTY_CARD_VALUES.includes(card.v);
}

function isBasicMatch(card, prevCard) {
  return card.v === prevCard.v || card.s === prevCard.s;
}

function getCardEffectAction(card) {
  // Jokers - allow suit choice
  if (card.s === RED_JOKER || card.s === BLACK_JOKER) {
    return {
      type: NextActionType.CHOOSE_SUIT,
      allowSuitChoice: true,
      message: 'Choose a suit for the joker'
    };
  }

  // Aces (15) - allow suit choice
  if (card.v === ACE_VALUE) {
    return {
      type: NextActionType.CHOOSE_SUIT,
      allowSuitChoice: true,
      message: 'Choose a suit for the ace'
    };
  }

  // 2s - draw penalty cards
  if (card.v === 2) {
    return {
      type: NextActionType.APPLY_PENALTY,
      penaltyCards: 2,
      message: 'Next player draws 2 cards'
    };
  }

  // 3s - draw penalty cards
  if (card.v === 3) {
    return {
      type: NextActionType.APPLY_PENALTY,
      penaltyCards: 3,
      message: 'Next player draws 3 cards'
    };
  }

  // 8s - skip turn
  if (card.v === 8) {
    return {
      type: NextActionType.SKIP_TURN,
      skipTurns: 1,
      message: 'Next player skips their turn'
    };
  }

  // Jacks (11) - skip turn
  if (card.v === 11) {
    return {
      type: NextActionType.SKIP_TURN,
      skipTurns: 1,
      message: 'Next player skips their turn'
    };
  }

  // Regular cards - just end turn
  return {
    type: NextActionType.END_TURN,
    message: 'Turn ends normally'
  };
}

function calculatePenaltyAction(playedCard, prevCard, currentPenaltyCount) {
  const prevValue = prevCard.v;
  const playedValue = playedCard.v;
  
  // Card relationships for penalty calculations
  const sameValue = PENALTY_CARD_VALUES.includes(prevValue) && prevValue === playedValue;
  const sameSuit = PENALTY_CARD_VALUES.includes(prevValue) && prevCard.s === playedCard.s;
  const prevCardIsStronger = PENALTY_CARD_VALUES.includes(prevValue) && prevValue > playedValue;
  const prevCardIsWeaker = PENALTY_CARD_VALUES.includes(prevValue) && prevValue < playedValue;
  const colorMatch = isSameColor(prevCard.s, playedCard.s);

  // Same value penalty cards - transfer penalty to next player
  if (sameValue) {
    return {
      type: NextActionType.TRANSFER_PENALTY,
      nextPlayerPenaltyCount: currentPenaltyCount + playedValue,
      currentPenaltyCount: 0,
      message: `Penalty transferred to next player (${currentPenaltyCount + playedValue} cards)`
    };
  }

  // Same suit with weaker card - transfer penalty
  if (sameSuit && prevCardIsWeaker) {
    return {
      type: NextActionType.TRANSFER_PENALTY,
      nextPlayerPenaltyCount: currentPenaltyCount + playedValue,
      currentPenaltyCount: 0,
      message: `Same suit weaker card - penalty transferred (${currentPenaltyCount + playedValue} cards)`
    };
  }

  // Same suit with stronger card - reduce penalty and apply remainder
  if (sameSuit && prevCardIsStronger) {
    const reduction = Math.min(currentPenaltyCount, playedValue);
    const remainingPenalty = Math.max(currentPenaltyCount - playedValue, 0);
    
    return {
      type: NextActionType.REDUCE_PENALTY,
      nextPlayerPenaltyCount: 0,
      currentPenaltyCount: remainingPenalty,
      drawCards: remainingPenalty,
      message: `Penalty reduced by ${reduction}, remaining: ${remainingPenalty} cards`
    };
  }

  // Color match with weaker card - increase penalty
  if (colorMatch && prevCardIsWeaker) {
    return {
      type: NextActionType.TRANSFER_PENALTY,
      nextPlayerPenaltyCount: currentPenaltyCount + playedValue,
      currentPenaltyCount: 0,
      message: `Color match weaker - penalty increased to ${currentPenaltyCount + playedValue} cards`
    };
  }

  // Color match with stronger card - reduce and apply
  if (colorMatch && prevCardIsStronger) {
    const reduction = Math.min(currentPenaltyCount, playedValue);
    const remainingPenalty = Math.max(currentPenaltyCount - playedValue, 0);
    
    return {
      type: NextActionType.REDUCE_PENALTY,
      nextPlayerPenaltyCount: 0,
      currentPenaltyCount: remainingPenalty,
      drawCards: remainingPenalty,
      message: `Color match stronger - penalty reduced, draw ${remainingPenalty} cards`
    };
  }

  // Default penalty card action
  const cardEffect = getCardEffectAction(playedCard);
  return {
    ...cardEffect,
    nextPlayerPenaltyCount: currentPenaltyCount + (cardEffect.penaltyCards || 0),
    currentPenaltyCount: 0
  };
}

function getNextAction(previousCard, playedCard, isPenaltyActive = false, currentPenaltyCount = 0, nextPlayerPenaltyCount = 0) {
  // First move - any card is valid
  if (!previousCard) {
    const cardEffect = getCardEffectAction(playedCard);
    return {
      valid: true,
      nextPlayerPenaltyCount: cardEffect.penaltyCards || 0,
      currentPenaltyCount: 0,
      ...cardEffect
    };
  }

  // Handle active penalty situations
  if (isPenaltyActive && currentPenaltyCount > 0) {
    // Can play penalty cards to counter/modify penalties
    if (isPenaltyCard(playedCard)) {
      const penaltyAction = calculatePenaltyAction(playedCard, previousCard, currentPenaltyCount);
      return {
        valid: true,
        ...penaltyAction
      };
    } 
    
    // Master card cancels all penalties
    else if (isMasterCard(playedCard)) {
      const cardEffect = getCardEffectAction(playedCard);
      return {
        valid: true,
        nextPlayerPenaltyCount: cardEffect.penaltyCards || 0,
        currentPenaltyCount: 0,
        message: 'Master card cancels all penalties',
        ...cardEffect
      };
    } 
    
    // Invalid move - must play penalty card or master card
    else {
      return {
        valid: false,
        type: NextActionType.INVALID_MOVE,
        nextPlayerPenaltyCount,
        currentPenaltyCount,
        message: `Must play a penalty card (2 or 3) or master card when penalty is active (${currentPenaltyCount} cards pending)`
      };
    }
  }

  // Basic matching (same value or suit)
  if (isBasicMatch(playedCard, previousCard)) {
    const cardEffect = getCardEffectAction(playedCard);
    return {
      valid: true,
      nextPlayerPenaltyCount: cardEffect.penaltyCards || 0,
      currentPenaltyCount: 0,
      ...cardEffect
    };
  }

  // Master cards (Ace of Spades) are generally always playable
  if (isMasterCard(playedCard)) {
    const cardEffect = getCardEffectAction(playedCard);
    return {
      valid: true,
      nextPlayerPenaltyCount: cardEffect.penaltyCards || 0,
      currentPenaltyCount: 0,
      message: 'Master card played',
      ...cardEffect
    };
  }

  // Other Aces are playable when no penalty is active
  if (isAce(playedCard)) {
    const cardEffect = getCardEffectAction(playedCard);
    return {
      valid: true,
      nextPlayerPenaltyCount: cardEffect.penaltyCards || 0,
      currentPenaltyCount: 0,
      message: 'Ace played',
      ...cardEffect
    };
  }

  // Joker matching rules
  if (isValidJokerMove(playedCard, previousCard)) {
    const cardEffect = getCardEffectAction(playedCard);
    return {
      valid: true,
      nextPlayerPenaltyCount: cardEffect.penaltyCards || 0,
      currentPenaltyCount: 0,
      message: 'Joker played with color match',
      ...cardEffect
    };
  }

  // If none of the above conditions are met, the move is invalid
  return {
    valid: false,
    type: NextActionType.INVALID_MOVE,
    nextPlayerPenaltyCount,
    currentPenaltyCount,
    message: `Cannot play ${playedCard.v} of ${playedCard.s} on ${previousCard.v} of ${previousCard.s}`
  };
}

module.exports = {
  getNextAction,
  NextActionType
};