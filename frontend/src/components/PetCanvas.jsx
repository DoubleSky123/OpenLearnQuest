import React, { useRef, useEffect } from 'react';

const XP_PER_LEVEL = 500;

export function getStage(xp) {
  if (xp >= 5000) return 'Legend';
  if (xp >= 3000) return 'Adult';
  if (xp >= 1500) return 'Young';
  if (xp >= 500)  return 'Puppy';
  return 'Newborn';
}

export default function PetCanvas({ stage, mood = 'idle', size = 120 }) {
  const ref      = useRef(null);
  const frameRef = useRef(0);
  const rafRef   = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const P = 4;
    const W = cv.width, H = cv.height;

    function f(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x * P, y * P, Math.max(1, w * P), Math.max(1, h * P));
    }

    const C = {
      bg: '#c8dfa8', fur: '#E8DCC8', dark: '#3C2A1A', mid: '#C4956A',
      mask: '#F5F0E8', nose: '#2a1a0e', eye: '#1a1a2e', white: '#FFFFFF',
      blue1: '#A8C8E8', blue2: '#5A9EC8', grey: '#9AAABB',
      blush: '#F0B8B0', tear: '#85B7EB', gold: '#EFB827',
      collar: '#7F77DD', badge: '#EF9F27',
    };

    function draw(frame) {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
      const bob =
        mood === 'happy' ? -Math.abs(Math.sin(frame * 0.15)) * 3
        : mood === 'sad' ? 2
        : Math.sin(frame * 0.04) * 2;
      const cy = Math.round(bob);

      if (stage === 'Newborn') {
        f(6,12+cy,14,10,C.fur); f(5,13+cy,16,8,C.fur); f(7,10+cy,12,10,C.fur);
        f(8,6+cy,3,6,C.dark); f(9,7+cy,2,5,C.mid); f(17,6+cy,3,6,C.dark); f(17,7+cy,2,5,C.mid);
        f(8,7+cy,12,9,C.fur); f(7,8+cy,14,8,C.fur);
        f(10,12+cy,10,5,C.mask);
        f(11,11+cy,3,1,C.dark); f(16,11+cy,3,1,C.dark);
        f(14,14+cy,3,1,C.nose);
        f(20,13+cy,2,3,C.fur); f(21,11+cy,2,3,C.fur); f(20,10+cy,2,2,C.fur);
        f(8,20+cy,3,2,C.fur); f(18,20+cy,3,2,C.fur);
        if (mood==='happy')    { f(9,15+cy,2,1,C.blush); f(18,15+cy,2,1,C.blush); }
        if (mood==='sad')      { f(12,13+cy,1,3,C.tear); f(17,13+cy,1,3,C.tear); }
        if (mood==='confused') { f(21,8+cy,2,1,C.gold); f(22,7+cy,1,2,C.gold); }

      } else if (stage === 'Puppy') {
        f(8,15+cy,14,10,C.fur); f(7,16+cy,16,8,C.fur); f(9,14+cy,12,4,C.grey);
        f(8,5+cy,4,8,C.dark); f(9,6+cy,2,7,C.mid); f(18,5+cy,4,8,C.dark); f(19,6+cy,2,7,C.mid);
        f(9,8+cy,12,9,C.fur); f(8,9+cy,14,8,C.fur);
        f(10,13+cy,10,6,C.mask);
        f(10,11+cy,3,3,C.blue1); f(11,11+cy,2,2,C.blue2); f(10,11+cy,1,1,C.white);
        f(16,11+cy,3,3,C.blue1); f(17,11+cy,2,2,C.blue2); f(16,11+cy,1,1,C.white);
        if (mood==='sad') { f(10,12+cy,3,2,C.blue1); f(16,12+cy,3,2,C.blue1); }
        f(14,15+cy,3,2,C.nose);
        if (mood==='happy')    { f(11,17+cy,2,1,C.dark); f(17,17+cy,2,1,C.dark); f(12,18+cy,6,1,C.dark); }
        else if (mood==='sad') { f(11,18+cy,8,1,C.dark); f(10,17+cy,2,1,C.dark); f(18,17+cy,2,1,C.dark); }
        else                   { f(11,17+cy,8,1,C.dark); }
        f(9,16+cy,2,1,C.blush); f(19,16+cy,2,1,C.blush);
        f(9,24+cy,3,5,C.fur); f(18,24+cy,3,5,C.fur);
        f(22,13+cy,3,5,C.fur); f(23,10+cy,3,4,C.fur);
        if (mood==='sad')      { f(10,14+cy,1,4,C.tear); f(18,14+cy,1,4,C.tear); }
        if (mood==='confused') { f(23,5+cy,2,1,C.gold); f(24,4+cy,1,2,C.gold); }
        if (mood==='happy')    { f(5,5+cy,1,1,C.gold); f(25,5+cy,1,1,C.gold); }

      } else if (stage === 'Young') {
        f(8,15+cy,14,11,C.fur); f(7,16+cy,16,9,C.fur); f(9,14+cy,12,4,C.grey);
        f(8,2+cy,4,9,C.dark); f(9,3+cy,2,7,C.mid); f(18,2+cy,4,9,C.dark); f(19,3+cy,2,7,C.mid);
        f(9,9+cy,12,9,C.fur); f(8,10+cy,14,8,C.fur);
        f(10,13+cy,10,6,C.mask);
        f(10,11+cy,3,3,C.blue1); f(11,11+cy,2,2,C.blue2); f(10,11+cy,1,1,C.white);
        f(16,11+cy,3,3,C.blue1); f(17,11+cy,2,2,C.blue2); f(16,11+cy,1,1,C.white);
        if (mood==='sad') { f(10,12+cy,3,2,C.blue1); f(16,12+cy,3,2,C.blue1); }
        f(13,15+cy,3,2,C.nose);
        if (mood==='happy')    { f(11,17+cy,2,1,C.dark); f(17,17+cy,2,1,C.dark); f(12,18+cy,6,1,C.dark); }
        else if (mood==='sad') { f(11,18+cy,8,1,C.dark); f(10,17+cy,2,1,C.dark); f(18,17+cy,2,1,C.dark); }
        else                   { f(11,17+cy,8,1,C.dark); }
        f(9,16+cy,2,1,C.blush); f(19,16+cy,2,1,C.blush);
        f(9,25+cy,3,6,C.fur); f(18,25+cy,3,6,C.fur); f(12,25+cy,2,5,C.fur); f(16,25+cy,2,5,C.fur);
        f(22,13+cy,3,6,C.fur); f(23,10+cy,3,5,C.fur); f(24,8+cy,2,4,C.fur);
        if (mood==='sad')   { f(10,14+cy,1,4,C.tear); f(18,14+cy,1,4,C.tear); }
        if (mood==='happy') { f(5,5+cy,1,1,C.gold); f(25,5+cy,1,1,C.gold); }

      } else if (stage === 'Adult') {
        f(7,15+cy,16,12,C.fur); f(6,16+cy,18,10,C.fur); f(8,14+cy,14,5,C.grey);
        f(8,1+cy,5,9,C.dark); f(9,2+cy,3,7,C.mid); f(17,1+cy,5,9,C.dark); f(18,2+cy,3,7,C.mid);
        f(9,9+cy,12,9,C.fur); f(8,10+cy,14,8,C.fur);
        f(10,13+cy,10,6,C.mask);
        f(10,11+cy,4,4,C.blue1); f(11,11+cy,3,3,C.blue2); f(10,11+cy,1,1,C.white);
        f(16,11+cy,4,4,C.blue1); f(17,11+cy,3,3,C.blue2); f(16,11+cy,1,1,C.white);
        if (mood==='sad') { f(10,12+cy,4,3,C.blue1); f(16,12+cy,4,3,C.blue1); }
        f(13,15+cy,4,2,C.nose);
        if (mood==='happy')    { f(11,17+cy,2,1,C.dark); f(17,17+cy,2,1,C.dark); f(12,18+cy,6,1,C.dark); }
        else if (mood==='sad') { f(11,18+cy,8,1,C.dark); f(10,17+cy,2,1,C.dark); f(18,17+cy,2,1,C.dark); }
        else                   { f(11,17+cy,8,1,C.dark); }
        f(9,22+cy,12,2,C.collar); f(14,22+cy,2,2,C.badge);
        f(8,16+cy,2,1,C.blush); f(20,16+cy,2,1,C.blush);
        f(8,27+cy,4,5,C.fur); f(18,27+cy,4,5,C.fur); f(12,27+cy,3,4,C.fur); f(15,27+cy,3,4,C.fur);
        f(23,12+cy,4,7,C.fur); f(24,9+cy,4,5,C.fur); f(25,7+cy,3,4,C.fur);
        if (mood==='sad')   { f(10,15+cy,1,5,C.tear); f(19,15+cy,1,5,C.tear); }
        if (mood==='happy') { f(4,4+cy,1,1,C.gold); f(6,3+cy,2,1,C.gold); f(25,4+cy,1,1,C.gold); f(26,3+cy,2,1,C.gold); }

      } else {
        // Legend
        f(6,18+cy,18,12,'#534AB7'); f(7,17+cy,16,3,'#7F77DD');
        f(7,15+cy,16,12,C.fur); f(6,16+cy,18,10,C.fur); f(8,14+cy,14,5,C.grey);
        f(8,1+cy,5,9,C.dark); f(9,2+cy,3,7,C.mid); f(17,1+cy,5,9,C.dark); f(18,2+cy,3,7,C.mid);
        f(7,6+cy,16,2,'#2C2C2A'); f(9,3+cy,12,4,'#444441'); f(14,2+cy,2,2,C.gold);
        f(21,6+cy,3,1,C.gold);
        f(9,9+cy,12,9,C.fur); f(8,10+cy,14,8,C.fur);
        f(10,13+cy,10,6,C.mask);
        f(10,11+cy,4,4,C.blue1); f(11,11+cy,3,3,C.blue2); f(10,11+cy,1,1,C.white); f(12,12+cy,1,1,C.white);
        f(16,11+cy,4,4,C.blue1); f(17,11+cy,3,3,C.blue2); f(16,11+cy,1,1,C.white); f(18,12+cy,1,1,C.white);
        if (mood==='sad') { f(10,12+cy,4,3,C.blue1); f(16,12+cy,4,3,C.blue1); }
        f(13,15+cy,4,2,C.nose);
        if (mood==='happy')    { f(11,17+cy,2,1,C.dark); f(17,17+cy,2,1,C.dark); f(12,18+cy,6,1,C.dark); }
        else if (mood==='sad') { f(11,18+cy,8,1,C.dark); f(10,17+cy,2,1,C.dark); f(18,17+cy,2,1,C.dark); }
        else                   { f(11,17+cy,8,1,C.dark); }
        f(9,22+cy,12,2,C.collar); f(14,22+cy,2,2,C.badge);
        f(8,16+cy,2,1,C.blush); f(20,16+cy,2,1,C.blush);
        f(8,27+cy,4,5,C.fur); f(18,27+cy,4,5,C.fur); f(12,27+cy,3,4,C.fur); f(15,27+cy,3,4,C.fur);
        f(23,12+cy,4,7,C.fur); f(24,9+cy,4,5,C.fur); f(25,7+cy,3,4,C.fur);
        var sc = mood==='happy' ? C.gold : '#AFA9EC';
        f(3,8+cy,1,1,sc); f(4,7+cy,2,1,sc); f(4,9+cy,1,1,sc);
        f(26,7+cy,1,1,sc); f(27,6+cy,2,1,sc); f(27,8+cy,1,1,sc);
        if (mood==='sad') { f(10,15+cy,1,5,C.tear); f(19,15+cy,1,5,C.tear); }
      }
    }

    function loop() {
      frameRef.current++;
      draw(frameRef.current);
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [stage, mood]);

  return (
    <canvas
      ref={ref}
      width={120} height={120}
      style={{ imageRendering: 'pixelated', width: size, height: size, display: 'block' }}
    />
  );
}
