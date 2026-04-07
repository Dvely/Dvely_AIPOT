import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { Users, Mail } from "lucide-react";

export function AuthScreen() {
  const navigate = useNavigate();

  const handleLogin = (role: "guest" | "free" | "pro") => {
     localStorage.setItem("aipot_role", role);
     localStorage.setItem("aipot_auth", role === "guest" ? "guest" : "user");
     navigate("/loading"); // 로그인 후 딜레이(로딩) 스크린으로 이동
  };

  return (
     <div className="relative flex flex-col items-center justify-center w-full h-full bg-[#11122D] overflow-hidden text-white select-none">
        {/* Background Texture */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />

        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="z-10 bg-[#1A1C3E] p-8 md:p-10 rounded-[32px] border border-white/10 shadow-2xl flex flex-col items-center w-full max-w-md mx-4"
        >
           <h1 className="text-5xl md:text-6xl font-black italic tracking-wider mb-2 text-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]">AIPOT</h1>
           <p className="text-slate-400 font-bold mb-8 text-center text-sm md:text-base">
             AI Poker Trainer<br/>Play, Analyze, and Improve.
           </p>

           <div className="w-full flex flex-col gap-4">
             <input 
               type="text" 
               placeholder="ID (Nickname)" 
               className="w-full bg-[#11122D] border border-white/10 rounded-xl p-4 text-white font-bold outline-none focus:border-cyan-500 transition placeholder:text-slate-500"
             />
             <input 
               type="password" 
               placeholder="Password" 
               className="w-full bg-[#11122D] border border-white/10 rounded-xl p-4 text-white font-bold outline-none focus:border-cyan-500 transition placeholder:text-slate-500"
             />
             <div className="flex gap-4 mt-2">
               <button
                 onClick={() => handleLogin("free")}
                 className="flex-1 bg-cyan-600 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-cyan-500 transition shadow-[0_4px_0_#0891B2] hover:translate-y-1 hover:shadow-none active:translate-y-1 text-sm md:text-base"
               >
                 Sign In (FREE)
               </button>
               <button
                 onClick={() => handleLogin("pro")}
                 className="flex-1 bg-purple-600 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-purple-500 transition shadow-[0_4px_0_#7E22CE] hover:translate-y-1 hover:shadow-none active:translate-y-1 text-sm md:text-base"
               >
                 Sign In (PRO)
               </button>
             </div>
           </div>

           <div className="w-full flex items-center gap-4 my-8 opacity-50">
             <div className="h-[1px] bg-white flex-1"></div>
             <span className="text-white font-black text-xs uppercase tracking-widest">OR</span>
             <div className="h-[1px] bg-white flex-1"></div>
           </div>

           <button
             onClick={() => handleLogin("guest")}
             className="w-full bg-transparent text-slate-300 border-2 border-slate-600 font-black py-4 rounded-xl hover:bg-slate-800 hover:text-white hover:border-slate-500 transition flex items-center justify-center gap-3 group"
           >
             <Users className="w-6 h-6 text-slate-400 group-hover:text-white transition" />
             Play as Guest
           </button>
        </motion.div>
        
        <footer className="absolute bottom-6 text-xs font-bold text-slate-500 tracking-wider">
           v1.2.0 (PRD)
        </footer>
     </div>
  );
}
