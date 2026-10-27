import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Smartphone, Sparkles } from 'lucide-react';
import { soundService } from '../services/sound';

interface QRCodeModalProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ roomId, isOpen, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = React.useState(false);
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [useLanIp, setUseLanIp] = React.useState(isLocalhost);
  const detectedLanIp = '172.17.188.91:5173';

  const baseOrigin = typeof window !== 'undefined'
    ? isLocalhost && useLanIp
      ? `http://${detectedLanIp}`
      : window.location.origin
    : `https://duelverse.app`;

  const joinUrl = `${baseOrigin}${typeof window !== 'undefined' ? window.location.pathname : ''}?room=${roomId}`;

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        joinUrl,
        {
          width: 240,
          margin: 2,
          color: {
            dark: '#0B0F19',
            light: '#FFFFFF'
          }
        },
        (error) => {
          if (error) console.error('QR Code render error:', error);
        }
      );
    }
  }, [isOpen, joinUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    soundService.playClick();
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="glass-panel max-w-sm w-full p-6 text-center relative border border-violet-500/30 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs font-semibold mb-3">
          <Smartphone className="w-3.5 h-3.5" />
          <span>Mobile Instant Join</span>
        </div>

        <h3 className="text-xl font-bold font-['Outfit'] text-white">
          Scan to Enter the Duel
        </h3>
        <p className="text-xs text-slate-400 mt-1 mb-5">
          Point your phone camera at the QR code below to connect instantly.
        </p>

        {/* QR Code Canvas */}
        <div className="p-3 bg-white rounded-2xl shadow-xl inline-block mx-auto mb-3 border-2 border-violet-500/40">
          <canvas ref={canvasRef} className="rounded-xl block" />
        </div>

        {isLocalhost && (
          <div className="mb-3 flex items-center justify-center gap-2">
            <button
              onClick={() => setUseLanIp(!useLanIp)}
              className="text-[11px] font-mono px-3 py-1 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 transition"
            >
              {useLanIp ? '📶 Wi-Fi Phone Scan (172.17.188.91)' : '💻 Localhost'}
            </button>
          </div>
        )}

        {/* Room Code Badge */}
        <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-3 mb-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Manual Room Code
          </p>
          <p className="text-2xl font-black font-mono tracking-widest text-violet-400">
            {roomId}
          </p>
        </div>

        {/* Copy Shareable Link */}
        <button
          onClick={handleCopyLink}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-300" />
              <span>Link Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy Direct Invite Link</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
