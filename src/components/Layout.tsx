import { Link, useLocation } from "react-router-dom";
import { Home, Tag, Wallet, LogOut, ArrowUpCircle, BarChart3, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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
    { path: "/transacoes", icon: ArrowUpCircle, label: "Transações" },
    { path: "/relatorios", icon: BarChart3, label: "Relatórios" },
    { path: "/contas", icon: Wallet, label: "Contas" },
    { path: "/categorias", icon: Tag, label: "Categorias" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top navbar */}
      <nav className="border-b bg-card shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between">
            <h1 className="text-base sm:text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
              Controle Financeiro
            </h1>

            <div className="flex items-center gap-2">
              {/* Desktop Navigation */}
              <div className="hidden lg:flex gap-1">
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

              {/* Desktop Logout */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="hidden lg:flex gap-2 text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden xl:inline">Sair</span>
              </Button>

              {/* Mobile Hamburger Menu (extra items + logout) */}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild className="lg:hidden">
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64">
                  <div className="flex flex-col gap-3 mt-8">
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
                    <div className="border-t pt-3">
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

      {/* Main content — extra bottom padding on mobile for bottom nav */}
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-24 lg:pb-6">
        {children}
      </main>

      {/* Bottom Navigation Bar — mobile only */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border">
        <div className="flex items-stretch h-16">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5 transition-transform", isActive && "scale-110")} />
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
