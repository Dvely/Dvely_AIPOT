import { useNavigate } from "react-router";
import { ArrowLeft, ShoppingBag, Coins, Crown, Check, Zap } from "lucide-react";
import { motion } from "motion/react";

export function Store() {
  const navigate = useNavigate();

  return (
    <div className="relative w-full h-full bg-[#11122D] flex flex-col font-sans select-none overflow-y-auto text-white no-scrollbar">
      {/* Top Header */}
      <header className="sticky top-0 flex items-center justify-between p-4 bg-[#1A1C3E] border-b border-white/5 z-20 shadow-md">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate("/lobby")}
            className="flex items-center gap-2 text-slate-300 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-bold">Lobby</span>
          </button>
          <div className="h-6 w-[1px] bg-white/10"></div>
          <h1 className="text-lg font-black tracking-wider uppercase flex items-center gap-2">
            <ShoppingBag className="text-yellow-400 w-5 h-5" />
            Store
          </h1>
        </div>
        
        <div className="flex items-center bg-gradient-to-r from-yellow-600 to-yellow-500 rounded-full pr-4 pl-3 py-1.5 shadow-lg border border-yellow-400">
           <Coins className="w-4 h-4 text-white mr-2" />
           <span className="font-black text-white text-sm">$10,420</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 p-6 lg:p-10 max-w-6xl mx-auto w-full">
        
        {/* Banner Section */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 rounded-2xl p-8 shadow-2xl border border-white/10 relative overflow-hidden mb-10 group"
        >
           <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/20 rounded-full blur-3xl group-hover:scale-110 transition-transform"></div>
           
           <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 bg-yellow-400 text-indigo-900 text-xs font-black uppercase px-3 py-1 rounded-full w-max mb-3 tracking-widest">
                  <Crown className="w-3 h-3" /> Monthly Pass
                </div>
                <h2 className="text-3xl md:text-5xl font-black mb-2 leading-tight">PRO BUNDLE</h2>
                <p className="text-indigo-100 font-bold max-w-md">
                  Unlock unlimited Hand Reviews, 2x daily chips, and completely ad-free experience.
                </p>
                <div className="flex gap-4 mt-6">
                   <div className="flex items-center gap-2 text-sm font-semibold"><Check className="w-4 h-4 text-yellow-400" /> Infinite Reviews</div>
                   <div className="flex items-center gap-2 text-sm font-semibold"><Check className="w-4 h-4 text-yellow-400" /> AI Coach Pro</div>
                </div>
              </div>

              <div className="flex flex-col items-center bg-black/40 p-6 rounded-xl border border-white/10 backdrop-blur-md shrink-0">
                 <div className="text-center mb-4">
                   <span className="text-3xl font-black text-white">$9.99</span>
                   <span className="text-slate-300 font-semibold">/mo</span>
                 </div>
                 <button className="bg-white text-indigo-900 font-black px-8 py-3 rounded-full hover:bg-slate-200 transition-colors uppercase tracking-wider shadow-lg">
                   Subscribe Now
                 </button>
              </div>
           </div>
        </motion.div>

        {/* Chips Section */}
        <div className="mb-10">
          <h3 className="text-xl font-black uppercase tracking-wider mb-6 flex items-center gap-2">
            <Coins className="text-yellow-400" />
            Buy Chips
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
             
             {[
               { id: 1, amount: "50,000", price: "$4.99", bonus: null, color: "from-blue-600 to-blue-500" },
               { id: 2, amount: "150,000", price: "$9.99", bonus: "POPULAR", color: "from-cyan-600 to-cyan-500" },
               { id: 3, amount: "500,000", price: "$19.99", bonus: "BEST VALUE", color: "from-green-600 to-emerald-500" },
               { id: 4, amount: "2,000,000", price: "$49.99", bonus: "WHALE", color: "from-orange-600 to-red-500" },
             ].map((pkg, i) => (
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  key={pkg.id} 
                  className={`relative flex flex-col items-center justify-between p-6 bg-gradient-to-b ${pkg.color} rounded-2xl shadow-xl border-2 border-white/10 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] transition-all cursor-pointer group`}
                >
                   {pkg.bonus && (
                     <div className="absolute -top-3 bg-yellow-400 text-black text-[10px] font-black px-3 py-1 rounded-full uppercase shadow-md z-10">
                       {pkg.bonus}
                     </div>
                   )}
                   
                   <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 rounded-2xl mix-blend-overlay"></div>
                   
                   <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4 border-[4px] border-white/30 shadow-[inset_0_0_20px_rgba(0,0,0,0.2)] group-hover:scale-110 transition-transform z-10">
                     <Coins className="w-10 h-10 text-yellow-300 drop-shadow-md" />
                   </div>
                   
                   <h4 className="text-2xl font-black drop-shadow-md z-10 mb-6">{pkg.amount}</h4>
                   
                   <button className="w-full bg-white text-slate-900 font-black py-3 rounded-xl shadow-md group-hover:bg-slate-100 z-10 transition-colors">
                     {pkg.price}
                   </button>
                </motion.div>
             ))}
          </div>
        </div>

      </div>
    </div>
  );
}
