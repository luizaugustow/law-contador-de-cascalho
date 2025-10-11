import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import Layout from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import TransactionForm from "@/components/TransactionForm";

type Transaction = {
  id: string;
  description: string;
  amount: number;
  type: string;
  date: string;
  account_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  observations: string | null;
  tags?: Tag[];
};

type Account = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
};

type Subcategory = {
  id: string;
  name: string;
  category_id: string;
};

type Tag = {
  id: string;
  name: string;
  color: string;
};

const Transactions = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    type: "despesa",
    date: new Date().toISOString().split('T')[0],
    account_id: "",
    category_id: "",
    subcategory_id: "",
    observations: "",
    tag_ids: [] as string[],
  });

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    fetchData();
  }, [selectedAccount, selectedCategory, selectedTags, startDate, endDate]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchData = async () => {
    try {
      let transQuery = supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false });

      if (selectedAccount !== "all") {
        transQuery = transQuery.eq("account_id", selectedAccount);
      }

      if (selectedCategory !== "all") {
        transQuery = transQuery.eq("category_id", selectedCategory);
      }

      if (startDate) {
        transQuery = transQuery.gte("date", startDate);
      }

      if (endDate) {
        transQuery = transQuery.lte("date", endDate);
      }

      const [transactionsRes, accountsRes, categoriesRes, subcategoriesRes, tagsRes, transactionTagsRes] = await Promise.all([
        transQuery,
        supabase.from("accounts").select("id, name"),
        supabase.from("categories").select("id, name"),
        supabase.from("subcategories").select("id, name, category_id"),
        supabase.from("tags").select("id, name, color"),
        supabase.from("transaction_tags").select("transaction_id, tag_id"),
      ]);

      if (transactionsRes.error) throw transactionsRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (subcategoriesRes.error) throw subcategoriesRes.error;
      if (tagsRes.error) throw tagsRes.error;

      // Mapear tags para transações
      let transactionsWithTags = (transactionsRes.data || []).map(transaction => {
        const transactionTags = (transactionTagsRes.data || [])
          .filter(tt => tt.transaction_id === transaction.id)
          .map(tt => (tagsRes.data || []).find(tag => tag.id === tt.tag_id))
          .filter(tag => tag !== undefined) as Tag[];
        
        return {
          ...transaction,
          tags: transactionTags
        };
      });

      // Filtrar por tags selecionadas
      if (selectedTags.length > 0) {
        transactionsWithTags = transactionsWithTags.filter(transaction =>
          transaction.tags?.some(tag => selectedTags.includes(tag.id))
        );
      }

      setTransactions(transactionsWithTags);
      setAccounts(accountsRes.data || []);
      setCategories(categoriesRes.data || []);
      setSubcategories(subcategoriesRes.data || []);
      setTags(tagsRes.data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const transactionData = {
        description: formData.description,
        amount: Number(formData.amount),
        type: formData.type,
        date: formData.date,
        account_id: formData.account_id,
        category_id: formData.category_id || null,
        subcategory_id: formData.subcategory_id || null,
        observations: formData.observations || null,
        user_id: user.id,
      };

      if (editingId) {
        const { error } = await supabase
          .from("transactions")
          .update(transactionData)
          .eq("id", editingId);
        
        if (error) throw error;

        // Deletar tags antigas e inserir novas
        await supabase
          .from("transaction_tags")
          .delete()
          .eq("transaction_id", editingId);

        if (formData.tag_ids.length > 0) {
          const tagRecords = formData.tag_ids.map(tag_id => ({
            transaction_id: editingId,
            tag_id
          }));
          
          const { error: tagError } = await supabase
            .from("transaction_tags")
            .insert(tagRecords);
          
          if (tagError) throw tagError;
        }
        
        toast({
          title: "Transação atualizada",
          description: "A transação foi atualizada com sucesso.",
        });
      } else {
        const { data: newTransaction, error } = await supabase
          .from("transactions")
          .insert([transactionData])
          .select()
          .single();
        
        if (error) throw error;

        // Inserir tags
        if (formData.tag_ids.length > 0 && newTransaction) {
          const tagRecords = formData.tag_ids.map(tag_id => ({
            transaction_id: newTransaction.id,
            tag_id
          }));
          
          const { error: tagError } = await supabase
            .from("transaction_tags")
            .insert(tagRecords);
          
          if (tagError) throw tagError;
        }
        
        toast({
          title: "Transação criada",
          description: "A transação foi criada com sucesso.",
        });
      }

      setOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar transação",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setFormData({
      description: transaction.description,
      amount: transaction.amount.toString(),
      type: transaction.type,
      date: transaction.date,
      account_id: transaction.account_id,
      category_id: transaction.category_id || "",
      subcategory_id: transaction.subcategory_id || "",
      observations: transaction.observations || "",
      tag_ids: transaction.tags?.map(t => t.id) || [],
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta transação?")) return;

    try {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Transação excluída",
        description: "A transação foi excluída com sucesso.",
      });
      
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir transação",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      description: "",
      amount: "",
      type: "despesa",
      date: new Date().toISOString().split('T')[0],
      account_id: "",
      category_id: "",
      subcategory_id: "",
      observations: "",
      tag_ids: [],
    });
    setEditingId(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getAccountName = (id: string) => {
    return accounts.find(a => a.id === id)?.name || "N/A";
  };

  const getCategoryName = (id: string | null) => {
    if (!id) return "N/A";
    return categories.find(c => c.id === id)?.name || "N/A";
  };

  const filteredSubcategories = subcategories.filter(s => s.category_id === formData.category_id);

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
      <div className="space-y-8 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Transações</h2>
            <p className="text-muted-foreground mt-1">
              Gerencie suas receitas e despesas
            </p>
          </div>
          
          <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (!isOpen) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Nova Transação
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Editar Transação" : "Nova Transação"}
                </DialogTitle>
              </DialogHeader>
              <TransactionForm
                formData={formData}
                setFormData={setFormData}
                accounts={accounts}
                categories={categories}
                subcategories={subcategories}
                tags={tags}
                filteredSubcategories={filteredSubcategories}
                onSubmit={handleSubmit}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Filtros */}
        <Card className="bg-gradient-card">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div>
                <Label htmlFor="start-date">Data Início</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="end-date">Data Fim</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="account-filter">Conta</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as contas</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="category-filter">Categoria</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1 mt-1 min-h-[40px] p-2 border rounded-md">
                  {tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      style={{
                        backgroundColor: selectedTags.includes(tag.id) ? tag.color : 'transparent',
                        color: selectedTags.includes(tag.id) ? '#fff' : tag.color,
                        borderColor: tag.color,
                        cursor: 'pointer'
                      }}
                      className="text-xs border"
                      onClick={() => {
                        setSelectedTags(prev =>
                          prev.includes(tag.id)
                            ? prev.filter(id => id !== tag.id)
                            : [...prev, tag.id]
                        );
                      }}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setSelectedAccount("all");
                    setSelectedCategory("all");
                    setSelectedTags([]);
                  }}
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {transactions.length === 0 ? (
            <Card className="bg-gradient-card">
              <CardContent className="py-12 text-center">
                <ArrowUpCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Nenhuma transação cadastrada ainda.
                </p>
              </CardContent>
            </Card>
          ) : (
            transactions.map((transaction) => (
              <Card key={transaction.id} className="bg-gradient-card hover:shadow-lg transition-all">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {transaction.type === "receita" ? (
                        <ArrowUpCircle className="h-8 w-8 text-success" />
                      ) : (
                        <ArrowDownCircle className="h-8 w-8 text-destructive" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-lg">{transaction.description}</h3>
                          {transaction.tags && transaction.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {transaction.tags.map(tag => (
                                <Badge 
                                  key={tag.id}
                                  style={{ 
                                    backgroundColor: tag.color,
                                    color: '#fff'
                                  }}
                                  className="text-xs"
                                >
                                  {tag.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                          <span>{new Date(transaction.date).toLocaleDateString("pt-BR")}</span>
                          <span>•</span>
                          <span>{getAccountName(transaction.account_id)}</span>
                          <span>•</span>
                          <span>{getCategoryName(transaction.category_id)}</span>
                        </div>
                        {transaction.observations && (
                          <p className="text-sm text-muted-foreground mt-2 italic">
                            {transaction.observations}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-2xl font-bold ${transaction.type === "receita" ? "text-success" : "text-destructive"}`}>
                        {transaction.type === "receita" ? "+" : "-"}{formatCurrency(transaction.amount)}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleEdit(transaction)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDelete(transaction.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Transactions;
