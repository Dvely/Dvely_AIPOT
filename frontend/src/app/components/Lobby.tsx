import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Coins, Menu, Crown, Settings, Plus, Target, Users, Swords, BookOpen, X, Lock, Unlock, LogOut, CheckCircle2, ShoppingBag, Info, Trophy, Timer, Volume2, Globe, ChevronRight
} from "lucide-react";
import { getCurrentAuth, signOut } from "../auth";

export function Lobby() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("QUICK PLAY");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [passwordModalTable, setPasswordModalTable] = useState<any | null>(null);
  const [spectateTournamentModal, setSpectateTournamentModal] = useState<any | null>(null);
  
  const [showMenu, setShowMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [profileTab, setProfileTab] = useState<"stats" | "avatar" | "settings">("stats");
  const [avatarOptions, setAvatarOptions] = useState({
    top: "shortHairShortFlat",
    skinColor: "ffdbb4",
    hairColor: "black",
    clothing: "hoodie",
    mouth: "smile",
    eyes: "default"
  });
  
  const { isLoggedIn, isPro, userName } = getCurrentAuth();

  const gameModes = [
    {
      id: "ai-bot",
      title: "AI Bot Training",
      icon: <Swords className="w-8 h-8 text-white" />,
      color: "from-blue-500 to-cyan-500",
      description: "Practice against AI opponents",
    },
    {
      id: "cash-game",
      title: "Cash Game",
      icon: <Coins className="w-8 h-8 text-white" />,
      color: "from-green-500 to-emerald-500",
      description: "Join public cash tables",
    },
    {
      id: "tournament",
      title: "Tournament",
      icon: <Crown className="w-8 h-8 text-white" />,
      color: "from-purple-500 to-fuchsia-500",
      description: "Compete for the top prize",
      locked: !isLoggedIn,
    },
    {
      id: "review",
      title: "Hand Review",
      icon: <BookOpen className="w-8 h-8 text-white" />,
      color: "from-orange-500 to-amber-500",
      description: "Analyze your past games",
      locked: !isLoggedIn,
    },
  ];

  const mockTables = [
    { id: "t1", type: "tournament", name: "Seoul Qualifier (Lvl 4)", stakes: "100/200", players: 128, max: 500, isPrivate: false, status: "Late Reg", prizePool: "$50,000", itm: "Top 36", buyIn: "$100" },
    { id: "t2", type: "tournament", name: "Sunday Million", stakes: "500/1K", players: 450, max: 1000, isPrivate: false, status: "Running", prizePool: "$1,000,000", itm: "Top 100", buyIn: "$500" },
    { id: "ai-practice", type: "bot", name: "AI Bot Practice Room", stakes: "0/0", players: 1, max: 8, isPrivate: false, highlight: true },
    { id: 1, type: "cash", name: "Seoul High Roller", stakes: "500/1K", players: 4, max: 8, isPrivate: false },
    { id: 2, type: "cash", name: "Beginner Friendly", stakes: "50/100", players: 2, max: 8, isPrivate: false },
    { id: 3, type: "cash", name: "VIP Lounge", stakes: "1K/2K", players: 5, max: 8, isPrivate: true },
    { id: 4, type: "cash", name: "Friday Night Poker", stakes: "100/200", players: 6, max: 8, isPrivate: true },
  ];

  const mockLeaderboard = [
    { rank: 1, name: "PokerKing99", chips: "$45,200,000", isMe: false },
    { rank: 2, name: "AllInAl", chips: "$38,150,000", isMe: false },
    { rank: 3, name: "SeoulShark", chips: "$31,900,000", isMe: false },
    { rank: 4, name: "RiverRat", chips: "$28,400,000", isMe: false },
    { rank: 42, name: isLoggedIn ? userName : "Guest_1092", chips: "$10,420", isMe: true },
  ];

  const mockQuests = [
    { id: 1, title: "Play 50 Hands", progress: 32, max: 50, reward: "$1,000" },
    { id: 2, title: "Win 3 pots at Showdown", progress: 1, max: 3, reward: "$500" },
    { id: 3, title: "Review 1 Hand", progress: 0, max: 1, reward: "Pro Ticket" },
  ];

  const handleTableClick = (table: any) => {
    if (table.type === "tournament" && !isLoggedIn) {
      alert("Guest cannot enter tournaments. Please sign in with your account.");
      return;
    }
    if (table.isPrivate) {
      setPasswordModalTable(table);
    } else {
      navigate("/play", { state: { mode: table.type, table: table, spectate: table.players >= table.max } });
    }
  };

  const handleGameModeClick = (id: string) => {
    if (id === "review") {
      if (!isPro) return alert("Hand Review requires a PRO subscription.");
      navigate("/review");
    }
    else if (id === "tournament") {
      if (!isLoggedIn) return alert("Guest cannot play tournaments.");
      navigate("/play", { state: { mode: "tournament" } });
    }
    else navigate("/play", { state: { mode: "cash" } });
  };

  const tournaments = mockTables.filter(t => t.type === "tournament");
  const cashGames = mockTables.filter(t => t.type === "cash");
  const botGames = mockTables.filter(t => t.type === "bot");

  return (
    <div className="flex flex-col w-full h-full bg-[#1A1B41] font-sans text-white relative overflow-hidden select-none">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />

      {/* Top Navigation Bar */}
      <header className="relative z-10 flex items-center justify-between p-4 bg-[#11122D] shadow-md border-b border-white/5">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Menu 
              className="w-8 h-8 cursor-pointer hover:text-cyan-400 transition" 
              onClick={() => setShowMenu(true)}
            />
            <h1 className="text-2xl font-black italic tracking-wider">AIPOT</h1>
          </div>
          <button 
            onClick={() => setActiveTab("QUESTS")}
            className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-full font-bold shadow-inner border border-indigo-400/30 transition"
          >
            <Target className="w-4 h-4 text-cyan-300" />
            <span>Daily Missions</span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div 
            onClick={() => setShowProfileModal(true)}
            className={`flex items-center rounded-full pr-4 pl-1 py-1 border border-white/10 transition cursor-pointer hover:bg-white/5 ${isLoggedIn ? 'bg-cyan-900/30' : 'bg-[#242754]'}`}
          >
            <div className={`${isLoggedIn ? 'bg-cyan-500' : 'bg-slate-500'} p-1.5 rounded-full mr-2`}>
              <Users className="w-4 h-4 text-white" />
            </div>
            <span className="font-mono font-bold text-sm">{isLoggedIn ? userName : "Guest"}</span>
          </div>

          <div 
            onClick={() => navigate("/store")}
            className="flex items-center bg-gradient-to-r from-yellow-600 to-yellow-500 rounded-full pr-2 pl-2 py-1 shadow-lg border border-yellow-400 cursor-pointer hover:scale-105 transition-transform"
          >
            <Coins className="w-5 h-5 text-white mr-2" />
            <span className="font-black text-lg text-white">$10,420</span>
            <button className="ml-3 bg-green-500 hover:bg-green-400 p-1 rounded-full shadow-inner transition">
              <Plus className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden z-10 p-4 md:p-6 gap-6 relative">
        {/* Left Sidebar */}
        <aside className="w-64 flex flex-col gap-4 shrink-0 hidden md:flex">
          <div className="bg-[#242754] rounded-2xl p-4 flex flex-col gap-3 border border-white/5 shadow-xl">
            <h2 className="text-center font-bold text-slate-300 text-sm tracking-widest mb-2">CUSTOMIZE</h2>
            
            <button 
              onClick={() => {
                if (!isLoggedIn) {
                  alert("Guest cannot create tables.");
                  return;
                }
                setShowCreateModal(true);
              }}
              className={`w-full font-black py-4 rounded-xl transition-all flex justify-center items-center gap-2 uppercase ${!isLoggedIn ? 'bg-slate-700 text-slate-400 shadow-[0_4px_0_#334155] opacity-80' : 'bg-gradient-to-b from-yellow-400 to-orange-500 text-white shadow-[0_4px_0_#B45309] hover:translate-y-1 hover:shadow-[0_0px_0_#B45309]'}`}
            >
              {!isLoggedIn ? <Lock className="w-5 h-5" /> : <Users className="w-5 h-5" />}
              Create Table
            </button>
            <p className="text-xs text-center text-slate-400 font-medium px-2 mt-2">
              Create a custom table and invite friends to play securely.
            </p>
          </div>

          <div 
            onClick={() => navigate("/store")}
            className="mt-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 shadow-lg border border-white/10 relative overflow-hidden group cursor-pointer"
          >
             <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/20 rounded-full blur-xl group-hover:scale-150 transition-transform"></div>
             <p className="text-xs font-bold text-cyan-300 uppercase mb-1">PRO BUNDLE</p>
             <h3 className="font-black text-lg leading-tight">Get 2x Chips & Ad-free</h3>
             <button className="mt-3 bg-white text-indigo-900 font-bold px-4 py-1.5 rounded-full text-sm hover:bg-slate-200 w-full transition shadow-md">Store</button>
          </div>
        </aside>

        {/* Center Panel */}
        <main className="flex-1 bg-[#242754] rounded-2xl border border-white/5 shadow-xl flex flex-col overflow-hidden relative">
          <div className="flex bg-[#1A1C3E] border-b border-white/10 shrink-0 overflow-x-auto no-scrollbar">
            {["QUICK PLAY", "TABLES", "LEADERBOARD", "QUESTS"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-4 font-bold text-sm md:text-base tracking-wider transition-colors min-w-[120px] ${
                  activeTab === tab
                    ? "text-white bg-[#242754] border-t-2 border-cyan-400"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 p-4 md:p-6 overflow-y-auto">
            {/* QUICK PLAY */}
            {activeTab === "QUICK PLAY" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full pb-8">
                {gameModes.map((mode, idx) => (
                  <motion.div
                    key={mode.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ scale: (mode as any).locked ? 1 : 1.02 }}
                    whileTap={{ scale: (mode as any).locked ? 1 : 0.98 }}
                    onClick={() => {
                      if ((mode as any).locked) {
                        alert("Guest cannot use this feature.");
                        return;
                      }
                      handleGameModeClick(mode.id);
                    }}
                    className={`cursor-pointer group relative rounded-2xl p-6 flex flex-col justify-end min-h-[160px] overflow-hidden shadow-lg bg-gradient-to-br ${mode.color} border-2 border-transparent ${(mode as any).locked ? 'opacity-75 grayscale sepia' : 'hover:border-white/50'} transition-all`}
                  >
                    <div className="absolute -right-6 -top-6 w-32 h-40 bg-white/10 rounded-xl rotate-12 backdrop-blur-sm group-hover:rotate-6 transition-transform flex items-center justify-center shadow-2xl">
                       {mode.icon}
                    </div>
                    {(mode as any).locked && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-2">
                          <Lock className="w-8 h-8 text-white" />
                          <span className="text-white font-bold text-sm tracking-wider uppercase">Pro Only</span>
                        </div>
                      </div>
                    )}
                    <h3 className="text-2xl font-black drop-shadow-md z-10">{mode.title}</h3>
                    <p className="text-sm font-semibold text-white/80 drop-shadow-sm z-10">{mode.description}</p>
                  </motion.div>
                ))}
              </div>
            )}
            
            {/* TABLES */}
            {activeTab === "TABLES" && (
              <div className="flex flex-col gap-6">
                {tournaments.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                      <Trophy className="text-yellow-400" /> Live Tournaments
                    </h2>
                    {tournaments.map((table, idx) => (
                      <motion.div 
                        key={table.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => {
                          if (!isLoggedIn) return;
                          handleTableClick(table);
                        }}
                        className={`flex flex-col md:flex-row md:items-center justify-between p-1 rounded-xl transition-transform shadow-lg group ${!isLoggedIn ? 'bg-slate-700 opacity-60 cursor-not-allowed' : 'bg-gradient-to-r from-yellow-600 to-orange-600 cursor-pointer hover:scale-[1.01]'}`}
                      >
                        <div className="flex-1 bg-[#11122D] rounded-lg p-4 flex items-center justify-between">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <Crown className="w-5 h-5 text-yellow-500" />
                              <span className="font-black text-xl text-yellow-400">{table.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-300">
                              <span className="flex items-center gap-1"><Coins className="w-3.5 h-3.5"/> Buy-in: {table.buyIn}</span>
                              <span className="text-slate-500">•</span>
                              <span className="flex items-center gap-1 text-green-400"><Timer className="w-3.5 h-3.5"/> {table.status}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs font-bold">
                              <div className="bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded border border-yellow-500/30 flex items-center gap-1">
                                <Trophy className="w-3 h-3" /> Prize: {table.prizePool}
                              </div>
                              <div className="bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1">
                                <Target className="w-3 h-3" /> ITM: {table.itm}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col items-end">
                              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Entries</span>
                              <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-white">
                                <Users className="w-4 h-4 text-slate-400"/>
                                {table.players}/{table.max}
                              </div>
                            </div>
                            <div className="hidden md:flex gap-2">
                               <button 
                                 onClick={(e) => { 
                                   e.stopPropagation(); 
                                   if (!isLoggedIn) {
                                     alert("Guest cannot watch tournaments.");
                                     return;
                                   }
                                   setSpectateTournamentModal(table); 
                                 }}
                                 className={`px-6 py-2 rounded-lg font-black uppercase tracking-wider text-sm shadow-md transition ${!isLoggedIn ? 'bg-slate-700 text-slate-500 opacity-70 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white hover:shadow-[0_0_15px_rgba(147,51,234,0.5)]'}`}
                               >
                                 {!isLoggedIn ? <Lock className="w-4 h-4 mx-auto" /> : "Watch"}
                               </button>
                               <button 
                                 onClick={(e) => { 
                                   e.stopPropagation(); 
                                   if (!isLoggedIn) {
                                     alert("Guest cannot enter tournaments.");
                                     return;
                                   }
                                   handleTableClick(table); 
                                 }}
                                 className={`px-6 py-2 rounded-lg font-black uppercase tracking-wider text-sm shadow-md transition ${!isLoggedIn ? 'bg-slate-700 text-slate-500 opacity-70 cursor-not-allowed' : 'bg-gradient-to-b from-yellow-400 to-orange-500 text-white hover:shadow-[0_0_15px_rgba(250,204,21,0.5)]'}`}
                               >
                                 {!isLoggedIn ? <Lock className="w-4 h-4 mx-auto" /> : "Enter"}
                               </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-3 mt-6">
                  <div className="flex justify-between items-center mb-1">
                    <h2 className="text-xl font-black text-white flex items-center gap-2"><Target className="text-cyan-400 w-5 h-5"/> AI Bot Games</h2>
                  </div>
                  {botGames.map((table, idx) => (
                      <motion.div 
                        key={table.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => handleTableClick(table)}
                        className="flex items-center justify-between p-4 rounded-xl border bg-gradient-to-r from-indigo-900/40 to-blue-900/40 border-indigo-500/50 hover:border-cyan-400/80 cursor-pointer hover:from-indigo-800/60 hover:to-blue-800/60 transition-all group"
                      >
                      <div className="flex flex-col gap-1">
                         <div className="flex items-center gap-2">
                           <span className="font-bold text-lg text-cyan-50">{table.name}</span>
                         </div>
                         <span className="text-sm font-semibold text-slate-400">Blinds: {table.stakes}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1 rounded-full border border-white/5">
                          <Users className="w-4 h-4 text-slate-300"/>
                          <span className="font-mono text-sm font-bold text-slate-200">{table.players}/{table.max}</span>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleTableClick(table); }}
                          className="hidden md:block px-6 py-2 rounded-lg font-bold uppercase tracking-wider text-sm shadow-md transition bg-cyan-600 hover:bg-cyan-500 text-white group-hover:shadow-[0_0_15px_rgba(6,182,212,0.6)]"
                        >
                          Practice
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="flex flex-col gap-3 mt-4">
                  <div className="flex justify-between items-center mb-1">
                    <h2 className="text-xl font-black text-white flex items-center gap-2"><Coins className="text-green-400 w-5 h-5"/> Cash Games</h2>
                    <button className="text-cyan-400 text-sm font-bold hover:text-cyan-300">Refresh</button>
                  </div>
                  
                  {cashGames.map((table, idx) => (
                      <motion.div 
                        key={table.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => handleTableClick(table)}
                        className={`flex items-center justify-between p-4 rounded-xl border ${table.players >= table.max ? 'bg-[#1A1C3E] border-purple-500/30 hover:border-purple-500/70 cursor-pointer group transition-all' : 'bg-[#1A1C3E] border-white/10 hover:border-cyan-500/50 cursor-pointer hover:bg-[#1f224a] transition-all group'}`}
                      >
                      <div className="flex flex-col gap-1">
                         <div className="flex items-center gap-2">
                           {table.isPrivate ? <Lock className="w-4 h-4 text-red-400" /> : <Unlock className="w-4 h-4 text-green-400" />}
                           <span className="font-bold text-lg">{table.name}</span>
                         </div>
                         <span className="text-sm font-semibold text-slate-400">Blinds: ${table.stakes}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1 rounded-full border border-white/5">
                          <Users className="w-4 h-4 text-slate-300"/>
                          <span className="font-mono text-sm font-bold text-slate-200">{table.players}/{table.max}</span>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleTableClick(table); }}
                          className={`hidden md:block px-6 py-2 rounded-lg font-bold uppercase tracking-wider text-sm shadow-md transition ${table.players >= table.max ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]' : 'bg-cyan-600 hover:bg-cyan-500 text-white group-hover:shadow-[0_0_15px_rgba(6,182,212,0.4)]'}`}
                        >
                          {table.players >= table.max ? "Watch" : "Join"}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* LEADERBOARD */}
            {activeTab === "LEADERBOARD" && (
              <div className="flex flex-col gap-3">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-black text-white">Top Players</h2>
                    <span className="text-xs font-bold text-slate-400 bg-[#11122D] px-3 py-1 rounded-full">Season 12</span>
                 </div>
                 
                 {mockLeaderboard.map((user, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      key={user.rank}
                      className={`flex items-center justify-between p-4 rounded-xl border ${user.isMe ? 'bg-indigo-600/20 border-indigo-400/50 shadow-inner' : 'bg-[#11122D] border-white/5'}`}
                    >
                      <div className="flex items-center gap-4">
                         <div className={`w-8 text-center font-black text-lg ${user.rank <= 3 ? 'text-yellow-400' : 'text-slate-500'}`}>
                           #{user.rank}
                         </div>
                         <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden border-2 border-slate-600">
                           <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} alt="avatar" />
                         </div>
                         <div className="font-bold text-white text-lg flex items-center gap-2">
                           {user.name} {user.isMe && <span className="bg-cyan-500 text-[10px] px-2 py-0.5 rounded-sm uppercase tracking-widest text-black">You</span>}
                         </div>
                      </div>
                      <div className="font-black text-green-400 tracking-wider">
                         {user.chips}
                      </div>
                    </motion.div>
                 ))}
              </div>
            )}

            {/* QUESTS */}
            {activeTab === "QUESTS" && (
              <div className="flex flex-col gap-4">
                 <div className="flex justify-between items-center mb-2">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                      <Target className="text-cyan-400" /> Daily Missions
                    </h2>
                    <span className="text-sm font-bold text-slate-400">Resets in 14:22:05</span>
                 </div>

                 {mockQuests.map((quest, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.1 }}
                      key={quest.id}
                      className="bg-[#11122D] p-5 rounded-2xl border border-white/5 relative overflow-hidden"
                    >
                       <div className="flex justify-between items-end mb-3">
                         <div className="flex flex-col gap-1">
                           <h3 className="font-bold text-lg text-white">{quest.title}</h3>
                           <span className="text-yellow-400 font-black text-sm">Reward: {quest.reward}</span>
                         </div>
                         <div className="font-mono text-sm font-bold text-slate-400">
                           {quest.progress} / {quest.max}
                         </div>
                       </div>
                       <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700 relative">
                         <motion.div 
                           initial={{ width: 0 }}
                           animate={{ width: `${(quest.progress / quest.max) * 100}%` }}
                           transition={{ duration: 1, delay: 0.5 }}
                           className={`absolute inset-y-0 left-0 ${quest.progress >= quest.max ? 'bg-green-500' : 'bg-gradient-to-r from-cyan-600 to-cyan-400'}`}
                         />
                       </div>
                       {quest.progress >= quest.max && (
                         <div className="absolute inset-0 bg-green-500/20 backdrop-blur-[2px] flex items-center justify-center z-10">
                           <button className="bg-green-500 text-white font-black px-6 py-2 rounded-full uppercase tracking-wider shadow-lg flex items-center gap-2 hover:bg-green-400 transition">
                             <CheckCircle2 className="w-5 h-5" /> Claim Reward
                           </button>
                         </div>
                       )}
                    </motion.div>
                 ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* CREATE MODAL */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#242754] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="bg-[#1A1C3E] p-4 flex justify-between items-center border-b border-white/5">
                <h3 className="text-xl font-black uppercase tracking-wider flex items-center gap-2">
                  <Users className="text-yellow-400 w-6 h-6"/> Create Table
                </h3>
                <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white transition">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6">
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-1">Game Mode</label>
                    <select className="w-full bg-[#11122D] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-cyan-500 transition">
                      <option value="ai-bot">AI Bot Training (No Money Risk)</option>
                      <option value="cash" disabled>Cash Game (Coming Soon)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-1">Max Table Size</label>
                    <select id="createTableMax" defaultValue="8" className="w-full bg-[#11122D] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-cyan-500 transition">
                      <option value="8">8 Players</option>
                      <option value="6">6 Players</option>
                      <option value="4">4 Players</option>
                      <option value="2">2 Players (Heads Up)</option>
                    </select>
                  </div>
                </div>
                <button 
                  onClick={() => {
                     const maxVal = parseInt((document.getElementById("createTableMax") as HTMLSelectElement)?.value || "8");
                     navigate("/play", { state: { table: { players: 1, max: maxVal, stakes: "0/0", isPrivate: true, name: "Custom Bot Game" } } });
                  }}
                  className="mt-6 w-full font-black py-4 rounded-xl text-white uppercase tracking-wider transition-all active:translate-y-1 shadow-lg bg-gradient-to-b from-yellow-400 to-orange-500 shadow-[0_4px_0_#B45309]"
                >
                  Create & Join
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PASSWORD MODAL */}
      <AnimatePresence>
        {passwordModalTable !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#242754] w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="bg-[#1A1C3E] p-4 flex justify-between items-center border-b border-white/5">
                <h3 className="text-xl font-black uppercase tracking-wider flex items-center gap-2">
                  <Lock className="text-red-400 w-6 h-6"/> Private Table
                </h3>
                <button onClick={() => setPasswordModalTable(null)} className="text-slate-400 hover:text-white transition">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6">
                <div className="flex flex-col gap-4">
                  <p className="text-sm font-semibold text-slate-300">This table is protected. Please enter the password set by the host to join.</p>
                  <input type="password" placeholder="Enter Password" autoFocus className="w-full bg-[#11122D] border border-white/10 rounded-lg p-4 text-white font-bold outline-none focus:border-cyan-500 transition placeholder:text-slate-500 text-center text-lg tracking-widest" />
                </div>
                <button 
                  onClick={() => navigate("/play", { state: { mode: passwordModalTable.type, spectate: passwordModalTable.players >= passwordModalTable.max } })}
                  className="mt-6 w-full font-black py-4 rounded-xl text-white uppercase tracking-wider transition-all active:translate-y-1 shadow-lg bg-gradient-to-b from-cyan-500 to-blue-600 shadow-[0_4px_0_#1D4ED8]"
                >
                  Enter Table
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SPECTATE TOURNAMENT MODAL */}
      <AnimatePresence>
        {spectateTournamentModal !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#242754] w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="bg-[#1A1C3E] p-4 md:p-5 flex justify-between items-center border-b border-white/5 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500/20 p-2 rounded-lg">
                    <Trophy className="text-purple-400 w-6 h-6"/>
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-wider text-white">Spectate Tournament</h3>
                    <p className="text-sm text-cyan-400 font-bold">{spectateTournamentModal.name}</p>
                  </div>
                </div>
                <button onClick={() => setSpectateTournamentModal(null)} className="text-slate-400 hover:text-white transition p-2 bg-white/5 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 md:p-6 overflow-y-auto flex-1 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Mock Tables inside Tournament */}
                  {[
                    { id: "t-1", name: "Table 1 (Featured)", players: 6, max: 6, avgStack: "142K" },
                    { id: "t-2", name: "Table 2", players: 6, max: 6, avgStack: "98K" },
                    { id: "t-3", name: "Table 3", players: 5, max: 6, avgStack: "115K" },
                    { id: "t-4", name: "Table 4", players: 6, max: 6, avgStack: "104K" },
                    { id: "t-5", name: "Table 5", players: 4, max: 6, avgStack: "88K" },
                    { id: "t-6", name: "Table 6", players: 6, max: 6, avgStack: "155K" },
                  ].map((tbl) => (
                    <motion.div 
                      key={tbl.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => navigate("/play", { state: { mode: "tournament", spectate: true, tournamentTable: tbl.id } })}
                      className="bg-[#11122D] border border-white/10 hover:border-purple-500/50 p-4 rounded-xl cursor-pointer group transition-all relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex justify-between items-start mb-3 relative z-10">
                        <div>
                          <h4 className="font-bold text-white text-lg flex items-center gap-2">
                            {tbl.name}
                            {tbl.id === "t-1" && <span className="bg-red-500 text-[10px] px-2 py-0.5 rounded uppercase tracking-widest">Live</span>}
                          </h4>
                          <span className="text-xs text-slate-400 font-semibold">Avg Stack: {tbl.avgStack}</span>
                        </div>
                        <div className="bg-black/50 px-2 py-1 rounded text-xs font-mono font-bold text-slate-300 flex items-center gap-1 border border-white/5">
                          <Users className="w-3 h-3" />
                          {tbl.players}/{tbl.max}
                        </div>
                      </div>
                      <div className="w-full flex justify-between items-center relative z-10 mt-2 border-t border-white/5 pt-3">
                        <span className="text-xs font-bold text-purple-400 uppercase tracking-wider group-hover:text-purple-300 transition-colors">Watch Live</span>
                        <ChevronRight className="w-4 h-4 text-purple-500 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PROFILE MODAL */}
      <AnimatePresence>
        {showProfileModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#242754] w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="bg-[#1A1C3E] p-4 flex justify-between items-center border-b border-white/5">
                <h3 className="text-xl font-black uppercase tracking-wider flex items-center gap-2">
                  <Users className="text-cyan-400 w-6 h-6"/> Player Profile
                </h3>
                <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-white transition">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-4 md:p-6 flex flex-col items-center">
                 <div className="w-24 h-24 rounded-full bg-slate-800 border-4 border-cyan-500 overflow-hidden mb-4 shadow-[0_0_15px_rgba(6,182,212,0.5)]">
                   <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${isLoggedIn ? userName : "Guest"}&top=${avatarOptions.top}&skinColor=${avatarOptions.skinColor}&hairColor=${avatarOptions.hairColor}&clothing=${avatarOptions.clothing}&mouth=${avatarOptions.mouth}&eyes=${avatarOptions.eyes}`} alt="avatar" />
                 </div>
                 <h2 className="text-2xl font-black">{isLoggedIn ? userName : "Guest_1092"}</h2>
                 <p className="text-cyan-400 font-bold text-sm mb-6 uppercase tracking-widest">{isPro ? "PRO Member" : isLoggedIn ? "FREE User" : "Guest"}</p>
                 
                 {isLoggedIn && (
                   <div className="flex gap-2 w-full mb-6">
                     <button onClick={() => setProfileTab("stats")} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition ${profileTab === "stats" ? "bg-cyan-600 text-white" : "bg-[#11122D] text-slate-400 hover:text-white"}`}>Stats</button>
                     <button onClick={() => setProfileTab("avatar")} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition ${profileTab === "avatar" ? "bg-cyan-600 text-white" : "bg-[#11122D] text-slate-400 hover:text-white"}`}>Avatar</button>
                     <button onClick={() => setProfileTab("settings")} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition ${profileTab === "settings" ? "bg-cyan-600 text-white" : "bg-[#11122D] text-slate-400 hover:text-white"}`}>Settings</button>
                   </div>
                 )}

                 {(!isLoggedIn || profileTab === "stats") && (
                   <div className="w-full bg-[#11122D] rounded-xl p-4 border border-white/5 grid grid-cols-2 gap-4 text-center mb-2">
                      <div>
                        <div className="text-slate-400 text-xs font-bold uppercase mb-1">Win Rate</div>
                        <div className="text-green-400 font-black text-xl">42.5%</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs font-bold uppercase mb-1">Hands Played</div>
                        <div className="text-white font-black text-xl">1,204</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs font-bold uppercase mb-1">Biggest Pot</div>
                        <div className="text-yellow-400 font-black text-xl">$52K</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs font-bold uppercase mb-1">Quests</div>
                        <div className="text-white font-black text-xl">15</div>
                      </div>
                   </div>
                 )}

                 {isLoggedIn && profileTab === "avatar" && (
                   <div className="w-full flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                     <div className="flex flex-col gap-1">
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Hair / Hat</label>
                       <select value={avatarOptions.top} onChange={e => setAvatarOptions(prev => ({...prev, top: e.target.value}))} className="w-full bg-[#11122D] border border-white/10 rounded-lg p-2.5 text-sm text-white font-bold outline-none focus:border-cyan-500">
                         <option value="shortHairShortFlat">Short Flat</option>
                         <option value="longHairStraight">Long Straight</option>
                         <option value="eyepatch">Eyepatch</option>
                         <option value="hat">Hat</option>
                         <option value="hijab">Hijab</option>
                         <option value="turban">Turban</option>
                         <option value="winterHat1">Winter Hat</option>
                       </select>
                     </div>
                     <div className="flex flex-col gap-1">
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Skin Color</label>
                       <select value={avatarOptions.skinColor} onChange={e => setAvatarOptions(prev => ({...prev, skinColor: e.target.value}))} className="w-full bg-[#11122D] border border-white/10 rounded-lg p-2.5 text-sm text-white font-bold outline-none focus:border-cyan-500">
                         <option value="ffdbb4">Light</option>
                         <option value="edb98a">Medium Light</option>
                         <option value="d08b5b">Medium</option>
                         <option value="ae5d29">Medium Dark</option>
                         <option value="614335">Dark</option>
                       </select>
                     </div>
                     <div className="flex flex-col gap-1">
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Hair Color</label>
                       <select value={avatarOptions.hairColor} onChange={e => setAvatarOptions(prev => ({...prev, hairColor: e.target.value}))} className="w-full bg-[#11122D] border border-white/10 rounded-lg p-2.5 text-sm text-white font-bold outline-none focus:border-cyan-500">
                         <option value="black">Black</option>
                         <option value="blonde">Blonde</option>
                         <option value="brown">Brown</option>
                         <option value="platinum">Platinum</option>
                         <option value="red">Red</option>
                         <option value="pastelPink">Pink</option>
                       </select>
                     </div>
                     <div className="flex flex-col gap-1">
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Clothing</label>
                       <select value={avatarOptions.clothing} onChange={e => setAvatarOptions(prev => ({...prev, clothing: e.target.value}))} className="w-full bg-[#11122D] border border-white/10 rounded-lg p-2.5 text-sm text-white font-bold outline-none focus:border-cyan-500">
                         <option value="blazerAndShirt">Blazer & Shirt</option>
                         <option value="blazerAndSweater">Blazer & Sweater</option>
                         <option value="hoodie">Hoodie</option>
                         <option value="overall">Overall</option>
                         <option value="shirtCrewNeck">Crew Neck Shirt</option>
                       </select>
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                       <div className="flex flex-col gap-1">
                         <label className="text-[10px] font-bold text-slate-400 uppercase">Face</label>
                         <select value={avatarOptions.eyes} onChange={e => setAvatarOptions(prev => ({...prev, eyes: e.target.value}))} className="w-full bg-[#11122D] border border-white/10 rounded-lg p-2 text-sm text-white font-bold outline-none focus:border-cyan-500">
                           <option value="default">Default</option>
                           <option value="happy">Happy</option>
                           <option value="surprised">Surprised</option>
                         </select>
                       </div>
                       <div className="flex flex-col gap-1">
                         <label className="text-[10px] font-bold text-slate-400 uppercase">Mouth</label>
                         <select value={avatarOptions.mouth} onChange={e => setAvatarOptions(prev => ({...prev, mouth: e.target.value}))} className="w-full bg-[#11122D] border border-white/10 rounded-lg p-2 text-sm text-white font-bold outline-none focus:border-cyan-500">
                           <option value="smile">Smile</option>
                           <option value="sad">Sad</option>
                           <option value="serious">Serious</option>
                         </select>
                       </div>
                     </div>
                     <button onClick={() => setProfileTab("stats")} className="bg-cyan-600 hover:bg-cyan-500 text-white font-black py-3 rounded-lg transition shadow-md w-full mt-2">
                       Save Avatar
                     </button>
                   </div>
                 )}

                 {isLoggedIn && profileTab === "settings" && (
                   <div className="w-full flex flex-col gap-4">
                     <div className="flex flex-col gap-2">
                       <label className="text-xs font-bold text-slate-400 uppercase">Change Password</label>
                       <input type="password" placeholder="New Password" className="w-full bg-[#11122D] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-cyan-500 transition placeholder:text-slate-600" />
                       <input type="password" placeholder="Confirm Password" className="w-full bg-[#11122D] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-cyan-500 transition placeholder:text-slate-600" />
                       <button onClick={() => setProfileTab("stats")} className="bg-cyan-600 hover:bg-cyan-500 text-white font-black py-3 rounded-lg transition shadow-md w-full mt-2">
                         Update Password
                       </button>
                     </div>
                   </div>
                 )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SETTINGS MODAL */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#242754] w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="bg-[#1A1C3E] p-4 flex justify-between items-center border-b border-white/5">
                <h3 className="text-xl font-black uppercase tracking-wider flex items-center gap-2">
                  <Settings className="text-slate-300 w-6 h-6"/> Settings
                </h3>
                <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-white transition">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-6">
                 
                 {/* Language */}
                 <div>
                   <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-3 uppercase tracking-wider">
                     <Globe className="w-4 h-4"/> Language
                   </h4>
                   <select className="w-full bg-[#11122D] border border-white/10 rounded-lg p-3 text-white font-bold outline-none focus:border-cyan-500 transition">
                      <option value="en">English</option>
                      <option value="ko">한국어 (Korean)</option>
                      <option value="ja">日本語 (Japanese)</option>
                   </select>
                 </div>

                 {/* Volume */}
                 <div>
                   <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-3 uppercase tracking-wider">
                     <Volume2 className="w-4 h-4"/> Audio Settings
                   </h4>
                   <div className="flex flex-col gap-4 bg-[#11122D] p-4 rounded-xl border border-white/5">
                     <div className="flex items-center gap-4">
                       <span className="text-xs font-bold text-slate-400 w-16">Master</span>
                       <input type="range" min="0" max="100" defaultValue="80" className="flex-1 accent-cyan-500" />
                     </div>
                     <div className="flex items-center gap-4">
                       <span className="text-xs font-bold text-slate-400 w-16">Music</span>
                       <input type="range" min="0" max="100" defaultValue="40" className="flex-1 accent-cyan-500" />
                     </div>
                     <div className="flex items-center gap-4">
                       <span className="text-xs font-bold text-slate-400 w-16">SFX</span>
                       <input type="range" min="0" max="100" defaultValue="100" className="flex-1 accent-cyan-500" />
                     </div>
                   </div>
                 </div>

                 <button onClick={() => setShowSettingsModal(false)} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black py-3 rounded-xl mt-2">
                   Save Changes
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SLIDE OUT MENU */}
      <AnimatePresence>
        {showMenu && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowMenu(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" 
            />
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-64 md:w-80 bg-[#1A1C3E] border-r border-white/10 shadow-2xl z-50 flex flex-col"
            >
               <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#11122D]">
                 <h2 className="text-2xl font-black italic">AIPOT</h2>
                 <button onClick={() => setShowMenu(false)} className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
               </div>

               <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                 <button onClick={() => { setShowProfileModal(true); setShowMenu(false); }} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-white/5 text-slate-300 hover:text-white font-bold transition text-left">
                   <Users className="w-5 h-5" /> Profile
                 </button>
                 <button onClick={() => { navigate("/store"); setShowMenu(false); }} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-white/5 text-slate-300 hover:text-white font-bold transition text-left">
                   <ShoppingBag className="w-5 h-5 text-yellow-400" /> Store
                 </button>
                 <button onClick={() => { setShowSettingsModal(true); setShowMenu(false); }} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-white/5 text-slate-300 hover:text-white font-bold transition text-left">
                   <Settings className="w-5 h-5" /> Settings
                 </button>
                 <button className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-white/5 text-slate-300 hover:text-white font-bold transition text-left opacity-50 cursor-not-allowed">
                   <Info className="w-5 h-5" /> Help & Support
                 </button>
               </div>

               <div className="p-4 border-t border-white/5">
                 <button 
                   onClick={() => {
                     signOut();
                     navigate("/");
                   }}
                   className="flex items-center gap-3 w-full p-3 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-bold transition text-left"
                 >
                   <LogOut className="w-5 h-5" /> {isLoggedIn ? "Log Out" : "Exit to Login"}
                 </button>
               </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
