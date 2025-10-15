// Adapted from https://github.com/chrisloy/fractavibes

import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { algorithms, type AlgorithmName } from "../consts";

export interface CanvasAnimation {
  cancel: () => void;
}

// Props now include width and height, but no longer need 'layout'
export interface AnimatedCanvasProps {
  algorithm: AlgorithmName;
  className?: string;
  width: number;
  height: number;
  seed?: { x: number; y: number; color: { r: number; g: number; b: number } };
  autoStart?: boolean;
}

export interface AnimatedCanvasRef {
  clearAndReset: () => void;
  startManualAnimation: () => void;
}

const AnimatedCanvas = forwardRef<AnimatedCanvasRef, AnimatedCanvasProps>(
  ({ algorithm, className, width, height, seed, autoStart = true }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const currentAnimationRef = useRef<CanvasAnimation | null>(null);

    const stopCurrentAnimation = () => {
      if (currentAnimationRef.current?.cancel) {
        currentAnimationRef.current.cancel();
        currentAnimationRef.current = null;
      }
    };

    const resetCanvas = (ctx: CanvasRenderingContext2D) => {
      stopCurrentAnimation();
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
    };

    const startAnimation = (
      context: CanvasRenderingContext2D,
      initialX?: number,
      initialY?: number,
      color?: { r: number; g: number; b: number },
    ) => {
      stopCurrentAnimation();

      // Change the fallback from random to the canvas center
      const x =
        initialX !== undefined && initialX !== 0
          ? initialX
          : Math.floor(width / 2);
      const y =
        initialY !== undefined && initialY !== 0
          ? initialY
          : Math.floor(height / 2);

      const selectedAlgorithm = algorithms[algorithm];
      if (selectedAlgorithm) {
        currentAnimationRef.current = selectedAlgorithm(
          context,
          width,
          height,
          x,
          y,
          color,
        ) as CanvasAnimation;
      } else {
        console.warn("Algorithm not implemented yet:", algorithm);
      }
    };

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || width === 0 || height === 0) {
        return;
      }
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      resetCanvas(context);

      if (autoStart) {
        startAnimation(context, seed?.x, seed?.y, seed?.color);
      }

      return () => {
        stopCurrentAnimation();
      };
    }, [width, height, algorithm, seed?.x, seed?.y, seed?.color, autoStart]);

    useImperativeHandle(ref, () => ({
      clearAndReset() {
        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (context) resetCanvas(context);
        }
      },
      startManualAnimation() {
        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (context) startAnimation(context, seed?.x, seed?.y, seed?.color);
        }
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={className}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
        }}
      />
    );
  },
);

AnimatedCanvas.displayName = "AnimatedCanvas";
export default AnimatedCanvas;
