export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_usage_limits: {
        Row: {
          chave: string
          created_at: string
          id: string
        }
        Insert: {
          chave?: string
          created_at?: string
          id?: string
        }
        Update: {
          chave?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          chave: string
          created_at: string | null
          descricao: string | null
          id: string
          updated_at: string | null
          valor: string | null
        }
        Insert: {
          chave: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          updated_at?: string | null
          valor?: string | null
        }
        Update: {
          chave?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          updated_at?: string | null
          valor?: string | null
        }
        Relationships: []
      }
      cotacao_itens: {
        Row: {
          cas: string | null
          cotacao_id: string
          created_at: string | null
          descricao_original: string
          id: string
          insumo_id: string | null
          ipi: number | null
          lote: string | null
          pais_origem: string | null
          preco_unitario: number
          quantidade: number | null
          quantidade_minima: number | null
          st: number | null
          unidade: string | null
          validade: string | null
        }
        Insert: {
          cas?: string | null
          cotacao_id: string
          created_at?: string | null
          descricao_original: string
          id?: string
          insumo_id?: string | null
          ipi?: number | null
          lote?: string | null
          pais_origem?: string | null
          preco_unitario: number
          quantidade?: number | null
          quantidade_minima?: number | null
          st?: number | null
          unidade?: string | null
          validade?: string | null
        }
        Update: {
          cas?: string | null
          cotacao_id?: string
          created_at?: string | null
          descricao_original?: string
          id?: string
          insumo_id?: string | null
          ipi?: number | null
          lote?: string | null
          pais_origem?: string | null
          preco_unitario?: number
          quantidade?: number | null
          quantidade_minima?: number | null
          st?: number | null
          unidade?: string | null
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_itens_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacoes: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string | null
          created_at: string | null
          data_cotacao: string
          erro_msg: string | null
          fornecedor_id: string
          frete_fixo: number | null
          frete_gratis_acima: number | null
          id: string
          pedido_minimo: number | null
          prazo_entrega_dias: number | null
          prazo_pagamento_dias: number | null
          status: string
          validade_cotacao: string | null
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          created_at?: string | null
          data_cotacao?: string
          erro_msg?: string | null
          fornecedor_id: string
          frete_fixo?: number | null
          frete_gratis_acima?: number | null
          id?: string
          pedido_minimo?: number | null
          prazo_entrega_dias?: number | null
          prazo_pagamento_dias?: number | null
          status?: string
          validade_cotacao?: string | null
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          created_at?: string | null
          data_cotacao?: string
          erro_msg?: string | null
          fornecedor_id?: string
          frete_fixo?: number | null
          frete_gratis_acima?: number | null
          id?: string
          pedido_minimo?: number | null
          prazo_entrega_dias?: number | null
          prazo_pagamento_dias?: number | null
          status?: string
          validade_cotacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacoes_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean | null
          cnpj: string | null
          created_at: string | null
          email: string | null
          id: string
          nome_fantasia: string | null
          razao_social: string
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          cnpj?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome_fantasia?: string | null
          razao_social: string
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          cnpj?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome_fantasia?: string | null
          razao_social?: string
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      insumo_sinonimos: {
        Row: {
          created_at: string | null
          id: string
          insumo_id: string
          sinonimo: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          insumo_id: string
          sinonimo: string
        }
        Update: {
          created_at?: string | null
          id?: string
          insumo_id?: string
          sinonimo?: string
        }
        Relationships: [
          {
            foreignKeyName: "insumo_sinonimos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos: {
        Row: {
          cas_number: string | null
          created_at: string | null
          descricao: string | null
          id: string
          nome_padrao: string
          unidade_padrao: string
          updated_at: string | null
        }
        Insert: {
          cas_number?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome_padrao: string
          unidade_padrao?: string
          updated_at?: string | null
        }
        Update: {
          cas_number?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome_padrao?: string
          unidade_padrao?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      mapa_cotacao_itens: {
        Row: {
          cotacao_id: string | null
          cotacao_item_id: string | null
          created_at: string | null
          embalagem: number | null
          fornecedor_nome: string | null
          frete_fixo: number | null
          id: string
          insumo_id: string
          insumo_nome: string | null
          justificativa: string | null
          mapa_id: string
          prazo_entrega_dias: number | null
          prazo_pagamento_dias: number | null
          preco_base: number | null
          preco_unitario: number | null
          quantidade: number | null
          quantidade_unidade: string | null
          score: number | null
          sugerido: boolean | null
          unidade: string | null
          unidade_base: string | null
          validade: string | null
          valor_total: number | null
        }
        Insert: {
          cotacao_id?: string | null
          cotacao_item_id?: string | null
          created_at?: string | null
          embalagem?: number | null
          fornecedor_nome?: string | null
          frete_fixo?: number | null
          id?: string
          insumo_id: string
          insumo_nome?: string | null
          justificativa?: string | null
          mapa_id: string
          prazo_entrega_dias?: number | null
          prazo_pagamento_dias?: number | null
          preco_base?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          quantidade_unidade?: string | null
          score?: number | null
          sugerido?: boolean | null
          unidade?: string | null
          unidade_base?: string | null
          validade?: string | null
          valor_total?: number | null
        }
        Update: {
          cotacao_id?: string | null
          cotacao_item_id?: string | null
          created_at?: string | null
          embalagem?: number | null
          fornecedor_nome?: string | null
          frete_fixo?: number | null
          id?: string
          insumo_id?: string
          insumo_nome?: string | null
          justificativa?: string | null
          mapa_id?: string
          prazo_entrega_dias?: number | null
          prazo_pagamento_dias?: number | null
          preco_base?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          quantidade_unidade?: string | null
          score?: number | null
          sugerido?: boolean | null
          unidade?: string | null
          unidade_base?: string | null
          validade?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mapa_cotacao_itens_cotacao_item_id_fkey"
            columns: ["cotacao_item_id"]
            isOneToOne: false
            referencedRelation: "cotacao_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapa_cotacao_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapa_cotacao_itens_mapa_id_fkey"
            columns: ["mapa_id"]
            isOneToOne: false
            referencedRelation: "mapas_cotacao"
            referencedColumns: ["id"]
          },
        ]
      }
      mapas_cotacao: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          comparacao: Json | null
          cotacoes_ids: string[]
          created_at: string | null
          id: string
          motivo_cancelamento: string | null
          pdf_url: string | null
          pesos: Json | null
          status: string
          titulo: string
          updated_at: string | null
          valor_total: number | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          comparacao?: Json | null
          cotacoes_ids?: string[]
          created_at?: string | null
          id?: string
          motivo_cancelamento?: string | null
          pdf_url?: string | null
          pesos?: Json | null
          status?: string
          titulo: string
          updated_at?: string | null
          valor_total?: number | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          comparacao?: Json | null
          cotacoes_ids?: string[]
          created_at?: string | null
          id?: string
          motivo_cancelamento?: string | null
          pdf_url?: string | null
          pesos?: Json | null
          status?: string
          titulo?: string
          updated_at?: string | null
          valor_total?: number | null
        }
        Relationships: []
      }
      sinonimos_ref: {
        Row: {
          id: number
          produto_padrao: string
          termo: string
        }
        Insert: {
          id?: number
          produto_padrao: string
          termo: string
        }
        Update: {
          id?: number
          produto_padrao?: string
          termo?: string
        }
        Relationships: []
      }
    }
    Views: {
      historico_compras: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          cotacao_id: string | null
          cotacao_item_id: string | null
          embalagem: number | null
          fornecedor_nome: string | null
          id: string | null
          insumo_id: string | null
          insumo_nome: string | null
          mapa_id: string | null
          mapa_titulo: string | null
          preco_base: number | null
          preco_unitario: number | null
          quantidade: number | null
          quantidade_unidade: string | null
          sugerido: boolean | null
          unidade: string | null
          unidade_base: string | null
          valor_total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      aprovar_mapa: {
        Args: {
          p_comparacao: Json
          p_itens: Json
          p_mapa_id: string
          p_valor_total: number
        }
        Returns: undefined
      }
      buscar_insumo_por_descricao: {
        Args: { p_descricao: string; p_limite?: number }
        Returns: {
          insumo_id: string
          nome_padrao: string
          similaridade: number
        }[]
      }
      buscar_por_sinonimo: {
        Args: { descricao: string; limite?: number }
        Returns: {
          produto_padrao: string
          similaridade: number
          termo_encontrado: string
        }[]
      }
      get_secret: { Args: { secret_name: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      vincular_itens_cotacao: {
        Args: { p_cotacao_id: string; p_limiar?: number }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
