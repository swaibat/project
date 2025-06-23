// __tests__/rules.test.js
const { getNextAction, NextActionType } = require('./rules');

describe('Card Game Rules', () => {
  // Helper function to create card objects
  const card = (value, suit) => ({ v: value, s: suit });
  
  // Helper function to create test expectations
  const expectValid = (result, type, additionalProps = {}) => {
    expect(result.valid).toBe(true);
    expect(result.type).toBe(type);
    Object.entries(additionalProps).forEach(([key, value]) => {
      expect(result[key]).toBe(value);
    });
  };
  
  const expectInvalid = (result, message = null) => {
    expect(result.valid).toBe(false);
    expect(result.type).toBe(NextActionType.INVALID_MOVE);
    if (message) {
      expect(result.message).toContain(message);
    }
  };

  describe('First Move (No Previous Card)', () => {
    test('should allow any regular card as first move', () => {
      const result = getNextAction(null, card(7, 'H'), false);
      expectValid(result, NextActionType.END_TURN);
    });

    test('should allow Ace as first move with suit choice', () => {
      const result = getNextAction(null, card(15, 'D'), false);
      expectValid(result, NextActionType.CHOOSE_SUIT, { allowSuitChoice: true });
    });

    test('should allow Master card (Ace of Spades) as first move', () => {
      const result = getNextAction(null, card(15, 'S'), false);
      expectValid(result, NextActionType.CHOOSE_SUIT, { allowSuitChoice: true });
    });

    test('should allow penalty cards as first move', () => {
      const result2 = getNextAction(null, card(2, 'C'), false);
      expectValid(result2, NextActionType.APPLY_PENALTY, { penaltyCards: 2 });

      const result3 = getNextAction(null, card(3, 'H'), false);
      expectValid(result3, NextActionType.APPLY_PENALTY, { penaltyCards: 3 });
    });

    test('should allow skip cards as first move', () => {
      const result8 = getNextAction(null, card(8, 'D'), false);
      expectValid(result8, NextActionType.SKIP_TURN, { skipTurns: 1 });

      const resultJack = getNextAction(null, card(11, 'S'), false);
      expectValid(resultJack, NextActionType.SKIP_TURN, { skipTurns: 1 });
    });

    test('should allow jokers as first move', () => {
      const redJoker = getNextAction(null, card(50, 'R'), false);
      expectValid(redJoker, NextActionType.CHOOSE_SUIT, { allowSuitChoice: true });

      const blackJoker = getNextAction(null, card(50, 'B'), false);
      expectValid(blackJoker, NextActionType.CHOOSE_SUIT, { allowSuitChoice: true });
    });
  });

  describe('Basic Matching Rules', () => {
    describe('Same Suit Matching', () => {
      test('should allow same suit matches', () => {
        const hearts = getNextAction(card(7, 'H'), card(10, 'H'), false);
        expectValid(hearts, NextActionType.END_TURN);

        const diamonds = getNextAction(card(4, 'D'), card(12, 'D'), false);
        expectValid(diamonds, NextActionType.END_TURN);

        const clubs = getNextAction(card(9, 'C'), card(6, 'C'), false);
        expectValid(clubs, NextActionType.END_TURN);

        const spades = getNextAction(card(13, 'S'), card(5, 'S'), false);
        expectValid(spades, NextActionType.END_TURN);
      });
    });

    describe('Same Value Matching', () => {
      test('should allow same value matches across suits', () => {
        const sevens = getNextAction(card(7, 'H'), card(7, 'C'), false);
        expectValid(sevens, NextActionType.END_TURN);

        const kings = getNextAction(card(13, 'D'), card(13, 'S'), false);
        expectValid(kings, NextActionType.END_TURN);

        const fours = getNextAction(card(4, 'C'), card(4, 'H'), false);
        expectValid(fours, NextActionType.END_TURN);
      });
    });

    describe('Invalid Moves', () => {
      test('should reject moves with different suit and value', () => {
        expectInvalid(getNextAction(card(7, 'H'), card(10, 'C'), false));
        expectInvalid(getNextAction(card(5, 'H'), card(9, 'C'), false));
        expectInvalid(getNextAction(card(12, 'S'), card(6, 'D'), false));
      });
    });
  });

  describe('Ace Rules', () => {
    test('should allow any Ace on any card', () => {
      const aceHearts = getNextAction(card(7, 'C'), card(15, 'H'), false);
      expectValid(aceHearts, NextActionType.CHOOSE_SUIT);

      const aceDiamonds = getNextAction(card(10, 'S'), card(15, 'D'), false);
      expectValid(aceDiamonds, NextActionType.CHOOSE_SUIT);

      const aceClubs = getNextAction(card(4, 'H'), card(15, 'C'), false);
      expectValid(aceClubs, NextActionType.CHOOSE_SUIT);

      const masterCard = getNextAction(card(6, 'D'), card(15, 'S'), false);
      expectValid(masterCard, NextActionType.CHOOSE_SUIT);
    });

    test('should allow cards on Aces with basic matching', () => {
      const result = getNextAction(card(15, 'H'), card(8, 'H'), false);
      expectValid(result, NextActionType.END_TURN);
    });

    test('should allow Ace on Ace', () => {
      const result = getNextAction(card(15, 'H'), card(15, 'D'), false);
      expectValid(result, NextActionType.CHOOSE_SUIT);
    });
  });

  describe('Joker Rules', () => {
    describe('Red Joker', () => {
      test('should allow Red Joker on red suits', () => {
        const onHearts = getNextAction(card(7, 'H'), card(50, 'R'), false);
        expectValid(onHearts, NextActionType.CHOOSE_SUIT);

        const onDiamonds = getNextAction(card(10, 'D'), card(50, 'R'), false);
        expectValid(onDiamonds, NextActionType.CHOOSE_SUIT);
      });

      test('should reject Red Joker on black suits', () => {
        expectInvalid(getNextAction(card(7, 'C'), card(50, 'R'), false));
        expectInvalid(getNextAction(card(9, 'S'), card(50, 'R'), false));
      });

      test('should allow red cards on Red Joker', () => {
        const hearts = getNextAction(card(50, 'R'), card(9, 'H'), false);
        expectValid(hearts, NextActionType.END_TURN);

        const diamonds = getNextAction(card(50, 'R'), card(13, 'D'), false);
        expectValid(diamonds, NextActionType.END_TURN);
      });

      test('should reject black cards on Red Joker', () => {
        expectInvalid(getNextAction(card(50, 'R'), card(7, 'C'), false));
        expectInvalid(getNextAction(card(50, 'R'), card(5, 'S'), false));
      });
    });

    describe('Black Joker', () => {
      test('should allow Black Joker on black suits', () => {
        const onClubs = getNextAction(card(6, 'C'), card(50, 'B'), false);
        expectValid(onClubs, NextActionType.CHOOSE_SUIT);

        const onSpades = getNextAction(card(11, 'S'), card(50, 'B'), false);
        expectValid(onSpades, NextActionType.CHOOSE_SUIT);
      });

      test('should reject Black Joker on red suits', () => {
        expectInvalid(getNextAction(card(8, 'H'), card(50, 'B'), false));
        expectInvalid(getNextAction(card(12, 'D'), card(50, 'B'), false));
      });

      test('should allow black cards on Black Joker', () => {
        const spades = getNextAction(card(50, 'B'), card(5, 'S'), false);
        expectValid(spades, NextActionType.END_TURN);

        const clubs = getNextAction(card(50, 'B'), card(14, 'C'), false);
        expectValid(clubs, NextActionType.END_TURN);
      });

      test('should reject red cards on Black Joker', () => {
        expectInvalid(getNextAction(card(50, 'B'), card(6, 'H'), false));
        expectInvalid(getNextAction(card(50, 'B'), card(9, 'D'), false));
      });
    });
  });

  describe('Penalty Cards (2s and 3s)', () => {
    describe('Normal Play', () => {
      test('should apply penalties when played normally', () => {
        const two = getNextAction(card(7, 'H'), card(2, 'H'), false);
        expectValid(two, NextActionType.APPLY_PENALTY, { 
          penaltyCards: 2,
          nextPlayerPenaltyCount: 2 
        });

        const three = getNextAction(card(8, 'C'), card(3, 'C'), false);
        expectValid(three, NextActionType.APPLY_PENALTY, { 
          penaltyCards: 3,
          nextPlayerPenaltyCount: 3 
        });
      });

      test('should allow same value penalty cards', () => {
        const twos = getNextAction(card(2, 'H'), card(2, 'S'), false);
        expectValid(twos, NextActionType.APPLY_PENALTY);

        const threes = getNextAction(card(3, 'D'), card(3, 'C'), false);
        expectValid(threes, NextActionType.APPLY_PENALTY);
      });
    });

    describe('Penalty Active State', () => {
      test('should allow penalty cards as counters', () => {
        const sameValue = getNextAction(card(2, 'H'), card(2, 'D'), true, 2);
        expectValid(sameValue, NextActionType.TRANSFER_PENALTY);

        const mixedPenalty = getNextAction(card(2, 'C'), card(3, 'S'), true, 2);
        expectValid(mixedPenalty, NextActionType.TRANSFER_PENALTY);
      });

      test('should allow Master card to cancel penalties', () => {
        const result = getNextAction(card(2, 'D'), card(15, 'S'), true, 2);
        expectValid(result, NextActionType.CHOOSE_SUIT, { 
          currentPenaltyCount: 0 
        });
        expect(result.message).toContain('Master card cancels all penalties');
      });

      test('should reject regular Aces during penalty', () => {
        expectInvalid(getNextAction(card(2, 'H'), card(15, 'D'), true, 2));
      });

      test('should reject regular cards during penalty', () => {
        expectInvalid(getNextAction(card(2, 'C'), card(7, 'H'), true, 2));
        expectInvalid(getNextAction(card(2, 'H'), card(8, 'H'), true, 2));
        expectInvalid(getNextAction(card(3, 'D'), card(11, 'S'), true, 3));
        expectInvalid(getNextAction(card(2, 'S'), card(8, 'C'), true, 2));
      });

      test('should reject jokers during penalty', () => {
        expectInvalid(getNextAction(card(2, 'H'), card(50, 'R'), true, 2));
        expectInvalid(getNextAction(card(3, 'C'), card(50, 'B'), true, 3));
      });
    });

    describe('Advanced Penalty Calculations', () => {
      test('should handle same suit penalty interactions', () => {
        // Same suit, weaker card - should transfer penalty
        const weaker = getNextAction(card(3, 'H'), card(2, 'H'), true, 3);
        expectValid(weaker, NextActionType.TRANSFER_PENALTY);

        // Same suit, stronger card - should reduce penalty
        const stronger = getNextAction(card(2, 'H'), card(3, 'H'), true, 2);
        expectValid(stronger, NextActionType.REDUCE_PENALTY);
      });

      test('should handle color matching penalty interactions', () => {
        // Color match, weaker card
        const colorWeaker = getNextAction(card(3, 'D'), card(2, 'H'), true, 3);
        expectValid(colorWeaker, NextActionType.TRANSFER_PENALTY);

        // Color match, stronger card
        const colorStronger = getNextAction(card(2, 'S'), card(3, 'C'), true, 2);
        expectValid(colorStronger, NextActionType.REDUCE_PENALTY);
      });

      test('should handle high penalty reductions', () => {
        const result = getNextAction(card(2, 'H'), card(3, 'H'), true, 5);
        expectValid(result, NextActionType.REDUCE_PENALTY);
        expect(result.drawCards).toBe(2); // 5 - 3 = 2 remaining
      });
    });
  });

  describe('Skip Cards (8s and Jacks)', () => {
    test('should apply skip effect when played normally', () => {
      const eight = getNextAction(card(7, 'H'), card(8, 'H'), false);
      expectValid(eight, NextActionType.SKIP_TURN, { skipTurns: 1 });

      const jack = getNextAction(card(9, 'S'), card(11, 'S'), false);
      expectValid(jack, NextActionType.SKIP_TURN, { skipTurns: 1 });
    });

    test('should allow same value skip cards', () => {
      const eights = getNextAction(card(8, 'C'), card(8, 'D'), false);
      expectValid(eights, NextActionType.SKIP_TURN);

      const jacks = getNextAction(card(11, 'H'), card(11, 'C'), false);
      expectValid(jacks, NextActionType.SKIP_TURN);
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle Master card on Joker', () => {
      const result = getNextAction(card(50, 'R'), card(15, 'S'), false);
      expectValid(result, NextActionType.CHOOSE_SUIT);
    });

    test('should handle Joker on Master card', () => {
      // Valid: Black joker on black Master card
      const valid = getNextAction(card(15, 'S'), card(50, 'B'), false);
      expectValid(valid, NextActionType.CHOOSE_SUIT);

      // Invalid: Red joker on black Master card
      expectInvalid(getNextAction(card(15, 'S'), card(50, 'R'), false));
    });

    test('should handle Ace on Joker', () => {
      const result = getNextAction(card(50, 'R'), card(15, 'H'), false);
      expectValid(result, NextActionType.CHOOSE_SUIT);
    });

    test('should reject cross-type invalid moves', () => {
      // Penalty on skip (different value, different suit)
      expectInvalid(getNextAction(card(8, 'H'), card(2, 'C'), false));
      
      // Skip on penalty (different value, different suit)
      expectInvalid(getNextAction(card(2, 'D'), card(11, 'S'), false));
    });
  });

  describe('Boundary and Edge Cases', () => {
    test('should reject sequential values without suit match', () => {
      expectInvalid(getNextAction(card(13, 'H'), card(12, 'D'), false)); // K to Q
      expectInvalid(getNextAction(card(12, 'C'), card(13, 'H'), false)); // Q to K
      expectInvalid(getNextAction(card(7, 'H'), card(8, 'C'), false));   // 7 to 8
    });

    test('should reject same color different suits without value match', () => {
      expectInvalid(getNextAction(card(5, 'H'), card(9, 'D'), false));   // Red cards
      expectInvalid(getNextAction(card(6, 'C'), card(10, 'S'), false));  // Black cards
    });

    test('should handle boundary values correctly', () => {
      // Lowest cards (2s)
      const lowest = getNextAction(card(2, 'H'), card(2, 'D'), false);
      expectValid(lowest, NextActionType.APPLY_PENALTY);

      // Ace to lowest card (same suit)
      const aceToLow = getNextAction(card(15, 'S'), card(2, 'S'), false);
      expectValid(aceToLow, NextActionType.APPLY_PENALTY);
    });

    test('should handle zero penalty edge cases', () => {
      // Penalty active but count = 0 should still enforce penalty rules
      expectInvalid(getNextAction(card(2, 'H'), card(7, 'C'), true, 0));
    });
  });

  describe('Joker and Penalty Combinations', () => {
    test('should allow joker after penalty card in normal play', () => {
      const result = getNextAction(card(2, 'H'), card(50, 'R'), false);
      expectValid(result, NextActionType.CHOOSE_SUIT);
    });

    test('should allow penalty after joker', () => {
      const result = getNextAction(card(50, 'R'), card(2, 'H'), false);
      expectValid(result, NextActionType.APPLY_PENALTY);
    });
  });

  describe('Return Value Structure', () => {
    test('should return consistent structure for valid moves', () => {
      const result = getNextAction(card(7, 'H'), card(8, 'H'), false);
      
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('type'); 
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('nextPlayerPenaltyCount');
      expect(result).toHaveProperty('currentPenaltyCount');
    });

    test('should return consistent structure for invalid moves', () => {
      const result = getNextAction(card(7, 'H'), card(10, 'C'), false);
      
      expect(result).toHaveProperty('valid', false);
      expect(result).toHaveProperty('type', NextActionType.INVALID_MOVE);
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('Cannot play');
    });
  });
});

describe('NextActionType Constants', () => {
  test('should have all required action types', () => {
    expect(NextActionType).toHaveProperty('INVALID_MOVE');
    expect(NextActionType).toHaveProperty('PLAY_CARD');
    expect(NextActionType).toHaveProperty('CHOOSE_SUIT');
    expect(NextActionType).toHaveProperty('APPLY_PENALTY');
    expect(NextActionType).toHaveProperty('SKIP_TURN');
    expect(NextActionType).toHaveProperty('END_TURN');
    expect(NextActionType).toHaveProperty('REDUCE_PENALTY');
    expect(NextActionType).toHaveProperty('TRANSFER_PENALTY');
  });
});