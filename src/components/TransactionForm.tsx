import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

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

type FormData = {
  description: string;
  amount: string;
  type: string;
  date: string;
  account_id: string;
  category_id: string;
  subcategory_id: string;
  observations: string;
  tag_ids: string[];
};

type TransactionFormProps = {
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  accounts: Account[];
  categories: Category[];
  subcategories: Subcategory[];
  tags: Tag[];
  filteredSubcategories: Subcategory[];
  onSubmit: (e: React.FormEvent) => void;
};

const TransactionForm = ({
  formData,
  setFormData,
  accounts,
  categories,
  subcategories,
  tags,
  filteredSubcategories,
  onSubmit,
}: TransactionFormProps) => {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="amount">Valor</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="type">Tipo</Label>
        <Select
          value={formData.type}
          onValueChange={(value) => setFormData({ ...formData, type: value })}
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
        <Label htmlFor="date">Data</Label>
        <Input
          id="date"
          type="date"
          value={formData.date}
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="account">Conta</Label>
        <Select
          value={formData.account_id}
          onValueChange={(value) => setFormData({ ...formData, account_id: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma conta" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="category">Categoria</Label>
        <Select
          value={formData.category_id}
          onValueChange={(value) =>
            setFormData({ ...formData, category_id: value, subcategory_id: "" })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma categoria" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredSubcategories.length > 0 && (
        <div>
          <Label htmlFor="subcategory">Subcategoria</Label>
          <Select
            value={formData.subcategory_id}
            onValueChange={(value) => setFormData({ ...formData, subcategory_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma subcategoria" />
            </SelectTrigger>
            <SelectContent>
              {filteredSubcategories.map((subcategory) => (
                <SelectItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="tags">Tags (opcional)</Label>
        <div className="space-y-2">
          <Select
            value="select-tag"
            onValueChange={(value) => {
              if (value !== "select-tag" && !formData.tag_ids.includes(value)) {
                setFormData({ 
                  ...formData, 
                  tag_ids: [...formData.tag_ids, value] 
                });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Adicionar tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="select-tag" disabled>
                Selecione uma tag
              </SelectItem>
              {tags
                .filter(tag => !formData.tag_ids.includes(tag.id))
                .map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </div>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          
          {formData.tag_ids.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.tag_ids.map((tagId) => {
                const tag = tags.find(t => t.id === tagId);
                if (!tag) return null;
                return (
                  <Badge
                    key={tagId}
                    style={{ 
                      backgroundColor: tag.color,
                      color: '#fff'
                    }}
                    className="gap-1"
                  >
                    {tag.name}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          tag_ids: formData.tag_ids.filter(id => id !== tagId)
                        });
                      }}
                      className="ml-1 hover:opacity-70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="observations">Observações</Label>
        <Textarea
          id="observations"
          value={formData.observations}
          onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
          placeholder="Adicione observações sobre esta transação (opcional)"
          rows={3}
        />
      </div>

      <Button type="submit" className="w-full">
        Salvar
      </Button>
    </form>
  );
};

export default TransactionForm;
