import React, { useState } from 'react';
import { X, Check, Trophy, Sparkles, Shuffle, Flame, Award, Shield, Palette } from 'lucide-react';
import {
  AVATARS,
  THEME_COLORS,
  getPlayerRank,
  generateRandomNickname,
  savePlayerProfile,
  type LocalPlayerProfile
} from '../services/player';
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
  const [selectedColor, setSelectedColor] = useState(profile.accentColor || '#8B5CF6');
  const [motto, setMotto] = useState(profile.motto || 'Ready to dominate the arena');
  const [activeTab, setActiveTab] = useState<'avatar' | 'theme'>('avatar');

  if (!isOpen) return null;

  const totalMatches = profile.stats.wins + profile.stats.losses + profile.stats.draws;
  const winRate = totalMatches > 0 ? Math.round((profile.stats.wins / totalMatches) * 100) : 0;
  const rank = getPlayerRank(profile.stats.wins);
  const currentStreak = profile.stats.currentStreak || 0;
  const bestStreak = profile.stats.bestStreak || currentStreak;

  const handleSave = () => {
    soundService.playClick();
    const updated: LocalPlayerProfile = {
      ...profile,
      nickname: nickname.trim() || profile.nickname,
      avatarId: selectedAvatar,
      accentColor: selectedColor,
      motto: motto.trim() || undefined
    };
    savePlayerProfile(updated);
    onUpdateProfile(updated);
    onClose();
  };

  const handleRandomizeAvatar = () => {
    soundService.playClick();
    const randAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    setSelectedAvatar(randAvatar);
  };

  const handleRandomizeNickname = () => {
    soundService.playClick();
    setNickname(generateRandomNickname());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="glass-panel max-w-lg w-full p-5 sm:p-7 relative border border-violet-500/40 shadow-2xl rounded-3xl my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Title */}
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl sm:text-2xl font-black font-['Outfit'] text-white">
            Duelist Battle Profile
          </h2>
        </div>

        {/* Hero Gamer Passport Card */}
        <div
          className="w-full p-4 sm:p-5 rounded-2xl border-2 mb-5 relative overflow-hidden shadow-xl"
          style={{
            borderColor: selectedColor,
            background: `linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.8) 100%)`,
            boxShadow: `0 0 35px ${selectedColor}25`
          }}
        >
          <div className="flex items-center gap-4">
            {/* Avatar Badge */}
            <div className="relative shrink-0">
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center text-4xl sm:text-5xl shadow-xl border-2"
                style={{
                  backgroundColor: `${selectedColor}20`,
                  borderColor: selectedColor
                }}
              >
                {selectedAvatar}
              </div>

              {/* Rank Crown/Badge */}
              <div
                className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-black font-mono shadow-md flex items-center gap-1 border border-white/20"
                style={{ backgroundColor: rank.color, color: '#000' }}
              >
                <span>{rank.badge}</span>
                <span className="text-[10px] uppercase font-bold">{rank.tier}</span>
              </div>
            </div>

            {/* Profile Info */}
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl font-black font-['Outfit'] text-white truncate">
                  {nickname || 'Player'}
                </span>
                <button
                  onClick={handleRandomizeNickname}
                  className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  title="Randomize Nickname"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-xs font-bold font-mono mt-0.5" style={{ color: rank.color }}>
                {rank.name.toUpperCase()}
              </div>

              <p className="text-xs text-slate-400 mt-1 italic line-clamp-1">
                "{motto}"
              </p>
            </div>
          </div>
        </div>

        {/* Career Stats Grid (Wins, Losses, Win Rate, Streak) */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/30 text-center">
            <div className="text-[10px] text-amber-400 font-bold uppercase font-mono flex items-center justify-center gap-1">
              <Trophy className="w-3 h-3" />
              <span>WINS</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono mt-0.5">
              {profile.stats.wins}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-rose-500/30 text-center">
            <div className="text-[10px] text-rose-400 font-bold uppercase font-mono">LOSSES</div>
            <div className="text-xl sm:text-2xl font-black text-rose-300 font-mono mt-0.5">
              {profile.stats.losses}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-cyan-500/30 text-center">
            <div className="text-[10px] text-cyan-400 font-bold uppercase font-mono">WIN RATE</div>
            <div className="text-xl sm:text-2xl font-black text-cyan-300 font-mono mt-0.5">
              {winRate}%
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-violet-500/30 text-center">
            <div className="text-[10px] text-violet-400 font-bold uppercase font-mono flex items-center justify-center gap-1">
              <Flame className="w-3 h-3 text-orange-400" />
              <span>STREAK</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-violet-300 font-mono mt-0.5">
              {currentStreak}
            </div>
          </div>
        </div>

        {/* Win Rate Progress Bar */}
        <div className="w-full bg-slate-900/80 p-3 rounded-xl border border-slate-800 mb-5 text-left">
          <div className="flex items-center justify-between text-xs font-mono font-bold mb-1.5">
            <span className="text-slate-400">TOTAL DUELS: {totalMatches}</span>
            <span className="text-emerald-400">{profile.stats.wins}W - {profile.stats.losses}L - {profile.stats.draws}D</span>
          </div>
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500"
              style={{ width: `${totalMatches > 0 ? (profile.stats.wins / totalMatches) * 100 : 0}%` }}
              title="Wins"
            />
            <div
              className="h-full bg-amber-500/70 transition-all duration-500"
              style={{ width: `${totalMatches > 0 ? (profile.stats.draws / totalMatches) * 100 : 0}%` }}
              title="Draws"
            />
            <div
              className="h-full bg-rose-500/80 transition-all duration-500"
              style={{ width: `${totalMatches > 0 ? (profile.stats.losses / totalMatches) * 100 : 0}%` }}
              title="Losses"
            />
          </div>
        </div>

        {/* Customization Controls */}
        <div className="space-y-4 mb-6 text-left">
          {/* Nickname & Motto Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                Gamer Tag (16 chars)
              </label>
              <input
                type="text"
                maxLength={16}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-white font-['Outfit'] font-bold focus:outline-none focus:border-cyan-400 transition text-sm"
                placeholder="Enter gamer tag"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                Battle Motto
              </label>
              <input
                type="text"
                maxLength={30}
                value={motto}
                onChange={(e) => setMotto(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-white font-['Outfit'] font-semibold focus:outline-none focus:border-cyan-400 transition text-sm"
                placeholder="Your battle motto"
              />
            </div>
          </div>

          {/* Avatar & Theme Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveTab('avatar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition flex items-center gap-1.5 ${
                activeTab === 'avatar'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              <span>Avatars (24)</span>
            </button>
            <button
              onClick={() => setActiveTab('theme')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition flex items-center gap-1.5 ${
                activeTab === 'theme'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Theme Colors</span>
            </button>
            <button
              onClick={handleRandomizeAvatar}
              className="ml-auto text-xs text-cyan-400 hover:text-cyan-300 font-mono font-bold flex items-center gap-1"
            >
              <Shuffle className="w-3 h-3" />
              <span>Random</span>
            </button>
          </div>

          {/* Tab 1: 24 Avatars Grid */}
          {activeTab === 'avatar' && (
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 bg-slate-900/90 p-3 rounded-2xl border border-slate-800 max-h-36 overflow-y-auto">
              {AVATARS.map((avatar, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    soundService.playClick();
                    setSelectedAvatar(avatar);
                  }}
                  className={`aspect-square rounded-xl flex items-center justify-center text-2xl transition duration-150 ${
                    selectedAvatar === avatar
                      ? 'bg-violet-600 border-2 border-cyan-400 scale-110 shadow-lg shadow-violet-500/40 z-10'
                      : 'bg-slate-800/80 hover:bg-slate-700 hover:scale-105 border border-transparent'
                  }`}
                >
                  {avatar}
                </button>
              ))}
            </div>
          )}

          {/* Tab 2: Theme Colors */}
          {activeTab === 'theme' && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 bg-slate-900/90 p-3 rounded-2xl border border-slate-800">
              {THEME_COLORS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    soundService.playClick();
                    setSelectedColor(t.hex);
                  }}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition ${
                    selectedColor === t.hex
                      ? 'bg-slate-800 border-white shadow-lg'
                      : 'bg-slate-900/60 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded-full shadow-md"
                    style={{ backgroundColor: t.hex }}
                  />
                  <span className="text-[10px] font-bold text-slate-300 font-mono truncate w-full text-center">
                    {t.label.split(' ')[1]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold font-['Outfit'] transition text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 px-4 rounded-xl btn-primary font-black font-['Outfit'] transition flex items-center justify-center gap-2 text-sm shadow-xl"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Save Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
};
