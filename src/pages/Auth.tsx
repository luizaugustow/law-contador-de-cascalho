import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import loginLogo from "@/assets/login-logo.png";


const emailSchema = z.string().email("Email inválido");
const passwordSchema = z.string()
  .min(6, "A senha deve ter no mínimo 6 caracteres")
  .max(100, "A senha deve ter no máximo 100 caracteres");

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
      }
    };
    checkUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate email
      emailSchema.parse(email);

      if (isForgotPassword) {
        // Send password recovery email
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/redefinir-senha`,
        });

        if (error) throw error;

        toast({
          title: "Email enviado!",
          description: "Verifique seu email para redefinir sua senha",
        });
        setIsForgotPassword(false);
      } else {
        // Validate password
        passwordSchema.parse(password);

        if (isSignUp) {
          // Sign up with email and password
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/`,
            },
          });

          if (error) throw error;

          toast({
            title: "Cadastro realizado!",
            description: "Você já pode fazer login",
          });
          setIsSignUp(false);
          setEmail("");
          setPassword("");
        } else {
          // Sign in with email and password
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) throw error;

          toast({
            title: "Login realizado!",
            description: "Bem-vindo de volta",
          });
        }
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Erro de validação",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: isSignUp ? "Erro ao cadastrar" : isForgotPassword ? "Erro ao enviar email" : "Erro ao fazer login",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-full max-w-xs h-64 rounded-2xl overflow-hidden">
            <img src={loginLogo} alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <CardTitle className="text-2xl">Controle Financeiro</CardTitle>
            <CardDescription className="mt-2">
              {isForgotPassword 
                ? "Digite seu email para recuperar sua senha" 
                : isSignUp 
                  ? "Crie sua conta para começar"
                  : "Entre com suas credenciais"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {!isForgotPassword && (
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                  maxLength={100}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isForgotPassword 
                ? "Enviar link de recuperação" 
                : isSignUp 
                  ? "Criar conta"
                  : "Entrar"}
            </Button>
            {!isForgotPassword && (
              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-sm"
                  disabled={loading}
                >
                  {isSignUp ? "Já tem conta? Entrar" : "Não tem conta? Cadastre-se"}
                </Button>
              </div>
            )}
            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setIsForgotPassword(!isForgotPassword);
                  setPassword("");
                }}
                className="text-sm"
                disabled={loading}
              >
                {isForgotPassword ? "Voltar para login" : "Esqueci minha senha"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
