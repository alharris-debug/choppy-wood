import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import config from './config';

function PhaserGame() {
  const gameRef = useRef(null);

  useEffect(() => {
    // Only create if not already exists
    if (gameRef.current) return;

    // Create new Phaser game instance
    const game = new Phaser.Game({
      ...config,
      parent: 'game-container'
    });

    gameRef.current = game;

    // Cleanup on unmount
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      id="game-container"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    />
  );
}

export default PhaserGame;
