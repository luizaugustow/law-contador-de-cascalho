import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit, Tag } from "lucide-react";
import Layout from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const categorySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  type: z.enum(["receita", "despesa"], { required_error: "Tipo é obrigatório" }),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Cor inválida"),
});

type Category = {
  id: string;
  name: string;
  type: string;
  color: string;
  subcategories?: Subcategory[];
};

type Subcategory = {
  id: string;
  name: string;
  category_id: string;
};

const Categories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [formData, setFormData] = useState({ name: "", type: "receita", color: "#3B82F6" });
  const [subFormData, setSubFormData] = useState({ name: "" });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    fetchCategories();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchCategories = async () => {
    try {
      const { data: categoriesData, error: catError } = await supabase
        .from("categories")
        .select("*")
        .order("created_at", { ascending: false });

      if (catError) throw catError;

      const { data: subcategoriesData, error: subError } = await supabase
        .from("subcategories")
        .select("*");

      if (subError) throw subError;

      const categoriesWithSubs = (categoriesData || []).map((cat) => ({
        ...cat,
        subcategories: (subcategoriesData || []).filter((sub) => sub.category_id === cat.id),
      }));

      setCategories(categoriesWithSubs);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar categorias",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      categorySchema.parse(formData);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (editingCategory) {
        const { error } = await supabase
          .from("categories")
          .update(formData)
          .eq("id", editingCategory.id);

        if (error) throw error;

        toast({ title: "Categoria atualizada com sucesso!" });
      } else {
        const { error } = await supabase
          .from("categories")
          .insert([{ ...formData, user_id: user.id }]);

        if (error) throw error;

        toast({ title: "Categoria criada com sucesso!" });
      }

      setDialogOpen(false);
      setEditingCategory(null);
      setFormData({ name: "", type: "receita", color: "#3B82F6" });
      fetchCategories();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Erro de validação",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao salvar categoria",
          description: error.message,
          variant: "destructive",
        });
      }
    }
  };

  const handleSubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (!subFormData.name.trim()) {
        throw new Error("Nome da subcategoria é obrigatório");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("subcategories")
        .insert([{
          name: subFormData.name,
          category_id: selectedCategory,
          user_id: user.id,
        }]);

      if (error) throw error;

      toast({ title: "Subcategoria criada com sucesso!" });
      setSubDialogOpen(false);
      setSubFormData({ name: "" });
      fetchCategories();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar subcategoria",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta categoria?")) return;

    try {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Categoria excluída com sucesso!" });
      fetchCategories();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir categoria",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteSub = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta subcategoria?")) return;

    try {
      const { error } = await supabase
        .from("subcategories")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Subcategoria excluída com sucesso!" });
      fetchCategories();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir subcategoria",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Categorias</h2>
            <p className="text-muted-foreground mt-1">
              Gerencie suas categorias e subcategorias
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingCategory(null)} className="gap-2">
                <Plus className="h-4 w-4" />
                Nova Categoria
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? "Editar Categoria" : "Nova Categoria"}
                </DialogTitle>
                <DialogDescription>
                  Preencha os dados da categoria
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Alimentação"
                      required
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <Label htmlFor="type">Tipo</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value: "receita" | "despesa") =>
                        setFormData({ ...formData, type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="receita">Receita</SelectItem>
                        <SelectItem value="despesa">Despesa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="color">Cor</Label>
                    <div className="flex gap-2">
                      <Input
                        id="color"
                        type="color"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        className="w-20"
                      />
                      <Input
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        placeholder="#3B82F6"
                        pattern="^#[0-9A-F]{6}$"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter className="mt-6">
                  <Button type="submit">Salvar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {categories.length === 0 ? (
          <Card className="bg-gradient-card">
            <CardContent className="py-12 text-center">
              <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Nenhuma categoria cadastrada ainda.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {categories.map((category) => (
              <Card key={category.id} className="bg-gradient-card shadow-md hover:shadow-lg transition-all">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span>{category.name}</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        category.type === "receita"
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive"
                      }`}>
                        {category.type}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingCategory(category);
                          setFormData({
                            name: category.name,
                            type: category.type as "receita" | "despesa",
                            color: category.color,
                          });
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(category.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium">Subcategorias</p>
                      <Dialog open={subDialogOpen && selectedCategory === category.id} onOpenChange={(open) => {
                        setSubDialogOpen(open);
                        if (open) setSelectedCategory(category.id);
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <Plus className="h-3 w-3" />
                            Adicionar
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Nova Subcategoria</DialogTitle>
                            <DialogDescription>
                              Adicionar subcategoria para {category.name}
                            </DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleSubSubmit}>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="subname">Nome</Label>
                                <Input
                                  id="subname"
                                  value={subFormData.name}
                                  onChange={(e) => setSubFormData({ name: e.target.value })}
                                  placeholder="Ex: Supermercado"
                                  required
                                />
                              </div>
                            </div>
                            <DialogFooter className="mt-6">
                              <Button type="submit">Salvar</Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                    {category.subcategories && category.subcategories.length > 0 ? (
                      <div className="space-y-2">
                        {category.subcategories.map((sub) => (
                          <div
                            key={sub.id}
                            className="flex items-center justify-between p-2 bg-secondary rounded-lg"
                          >
                            <span className="text-sm">{sub.name}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleDeleteSub(sub.id)}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma subcategoria
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Categories;
