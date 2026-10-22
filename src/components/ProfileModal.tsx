import React, { useState } from 'react';
import { X, Check, Trophy, Sparkles, Shuffle } from 'lucide-react';
import { AVAILABLE_AVATARS, savePlayerProfile, type LocalPlayerProfile } from '../services/player';
import { soundService } from '../services/sound';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: LocalPlayerProfile;
  onUpdateProfile: (updated: LocalPlayerProfile) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onUpdateProfile
}) => {
  const [nickname, setNickname] = useState(profile.nickname);
  const [selectedAvatar, setSelectedAvatar] = useState(profile.avatarId);

  if (!isOpen) return null;

  const handleSave = () => {
    soundService.playClick();
    const updated: LocalPlayerProfile = {
      ...profile,
      nickname: nickname.trim() || profile.nickname,
      avatarId: selectedAvatar
    };
    savePlayerProfile(updated);
    onUpdateProfile(updated);
    onClose();
  };

  const handleRandomize = () => {
    soundService.playClick();
    const randAvatar = AVAILABLE_AVATARS[Math.floor(Math.random() * AVAILABLE_AVATARS.length)];
    setSelectedAvatar(randAvatar);
  };

  const winRate =
    profile.stats.wins + profile.stats.losses > 0
      ? Math.round(
          (profile.stats.wins / (profile.stats.wins + profile.stats.losses + profile.stats.draws)) *
            100
        )
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="glass-panel max-w-sm w-full p-6 text-center relative border border-violet-500/30 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold font-['Outfit'] text-white mb-1">
          Player Profile
        </h3>
        <p className="text-xs text-slate-400 mb-5">Customize your battle persona and avatar</p>

        {/* Current Avatar Showcase */}
        <div className="relative inline-block mb-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-violet-600/40 to-cyan-500/40 border-2 border-violet-500/60 flex items-center justify-center text-4xl shadow-lg shadow-violet-500/20">
            {selectedAvatar}
          </div>
          <button
            onClick={handleRandomize}
            className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-slate-800 text-cyan-400 border border-cyan-500/40 hover:bg-slate-700 transition"
            title="Random Avatar"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Avatar Picker Grid */}
        <div className="grid grid-cols-6 gap-2 mb-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          {AVAILABLE_AVATARS.map((avatar) => (
            <button
              key={avatar}
              onClick={() => {
                soundService.playClick();
                setSelectedAvatar(avatar);
              }}
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition ${
                selectedAvatar === avatar
                  ? 'bg-violet-600/80 border-2 border-violet-400 scale-110 shadow-md shadow-violet-500/40'
                  : 'bg-slate-800/60 hover:bg-slate-700/80 border border-transparent'
              }`}
            >
              {avatar}
            </button>
          ))}
        </div>

        {/* Nickname Input */}
        <div className="mb-5 text-left">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Battle Tag / Nickname
          </label>
          <input
            type="text"
            maxLength={16}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white font-['Outfit'] font-semibold focus:outline-none focus:border-violet-500 transition text-sm"
            placeholder="Enter nickname"
          />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-3 rounded-xl border border-slate-800 mb-5">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Wins</div>
            <div className="text-lg font-black text-amber-400 font-mono">
              {profile.stats.wins}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Losses</div>
            <div className="text-lg font-black text-rose-400 font-mono">
              {profile.stats.losses}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Win Rate</div>
            <div className="text-lg font-black text-cyan-400 font-mono">{winRate}%</div>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          <span>Save Profile</span>
        </button>
      </div>
    </div>
  );
};
