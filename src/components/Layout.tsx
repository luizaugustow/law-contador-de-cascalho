import { Link, useLocation } from "react-router-dom";
import { Home, Tag, Wallet, LogOut, ArrowUpCircle, BarChart3, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Erro ao sair",
        description: error.message,
        variant: "destructive",
      });
    } else {
      navigate("/auth");
    }
  };

  const navItems = [
    { path: "/", icon: Home, label: "Visão Geral" },
    { path: "/categorias", icon: Tag, label: "Categorias e Tags" },
    { path: "/contas", icon: Wallet, label: "Contas" },
    { path: "/transacoes", icon: ArrowUpCircle, label: "Transações" },
    { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-lg sm:text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Controle Financeiro
              </h1>
              
              {/* Desktop Navigation */}
              <div className="hidden lg:flex gap-2">
                {navItems.map((item) => (
                  <Link key={item.path} to={item.path}>
                    <Button
                      variant={location.pathname === item.path ? "default" : "ghost"}
                      size="sm"
                      className="gap-2"
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="hidden xl:inline">{item.label}</span>
                    </Button>
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Desktop Logout */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="hidden sm:flex gap-2 text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden md:inline">Sair</span>
              </Button>

              {/* Mobile Menu */}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild className="lg:hidden">
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64">
                  <div className="flex flex-col gap-4 mt-8">
                    {navItems.map((item) => (
                      <Link 
                        key={item.path} 
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Button
                          variant={location.pathname === item.path ? "default" : "ghost"}
                          className="w-full justify-start gap-3"
                        >
                          <item.icon className="h-5 w-5" />
                          {item.label}
                        </Button>
                      </Link>
                    ))}
                    <div className="border-t pt-4">
                      <Button
                        variant="ghost"
                        onClick={handleLogout}
                        className="w-full justify-start gap-3 text-destructive hover:text-destructive"
                      >
                        <LogOut className="h-5 w-5" />
                        Sair
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-4 sm:py-8">{children}</main>
    </div>
  );
};

export default Layout;
