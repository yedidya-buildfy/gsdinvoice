json for the 4:
"line_item": {                                                                                                                                   
      "id": "uuid",                                                                                                                                  
      "invoice_id": "uuid",                                                                                                                          
      "description": "string",                                                                                                                       
      "quantity": "numeric",                                                                                                                         
      "unit_price_agorot": "numeric",                                                                                                                
      "total_agorot": "numeric",                                                                                                                     
      "transaction_date": "date",                                                                                                                    
      "reference_id": "string",                                                                                                                      
      "currency": "string",                                                                                                                          
      "vat_rate": "numeric",                                                                                                                         
      "vat_amount_agorot": "integer",                                                                                                                
      "normalized_description": "string",                                                                                                            
      "is_document_link": "boolean",                                                                                                                 
      "match_status": "string",                                                                                                                      
      "match_method": "string",                                                                                                                      
      "match_confidence": "numeric",                                                                                                                 
      "matched_at": "timestamp",                                                                                                                     
      "transaction_id": "uuid",                                                                                                                      
      "allocation_amount_agorot": "numeric",                                                                                                         
      "created_at": "timestamp"                                                                                                                      
    },                                                                                                                                               
    "invoice": {                                                                                                                                     
      "id": "uuid",                                                                                                                                  
      "user_id": "uuid",                                                                                                                             
      "team_id": "uuid",                                                                                                                             
      "file_id": "uuid",                                                                                                                             
      "vendor_name": "string",                                                                                                                       
      "invoice_number": "string",                                                                                                                    
      "invoice_date": "date",                                                                                                                        
      "due_date": "date",                                                                                                                            
      "subtotal_agorot": "numeric",                                                                                                                  
      "vat_amount_agorot": "numeric",                                                                                                                
      "total_amount_agorot": "numeric",                                                                                                              
      "currency": "string",                                                                                                                          
      "confidence_score": "integer",                                                                                                                 
      "status": "string",                                                                                                                            
      "is_income": "boolean",                                                                                                                        
      "created_at": "timestamp"                                                                                                                      
    },                                                                                                                                               
    "file": {                                                                                                                                        
      "id": "uuid",                                                                                                                                  
      "user_id": "uuid",                                                                                                                             
      "team_id": "uuid",                                                                                                                             
      "storage_path": "string",                                                                                                                      
      "file_type": "string",                                                                                                                         
      "source_type": "string",                                                                                                                       
      "original_name": "string",                                                                                                                     
      "file_size": "integer",                                                                                                                        
      "status": "string",                                                                                                                            
      "file_hash": "string",                                                                                                                         
      "error_message": "string",                                                                                                                     
      "created_at": "timestamp",                                                                                                                     
      "processed_at": "timestamp",                                                                                                                   
      "extracted_data": {                                                                                                                            
        "confidence": "integer",                                                                                                                     
        "vendor": {                                                                                                                                  
          "name": "string",                                                                                                                          
          "vat_id": "string",                                                                                                                        
          "country": "string"                                                                                                                        
        },                                                                                                                                           
        "document": {                                                                                                                                
          "type": "string",                                                                                                                          
          "number": "string",                                                                                                                        
          "date": "string",                                                                                                                          
          "billing_period": {                                                                                                                        
            "start": "string",                                                                                                                       
            "end": "string"                                                                                                                          
          }                                                                                                                                          
        },                                                                                                                                           
        "totals": {                                                                                                                                  
          "subtotal": "number",                                                                                                                      
          "vat_rate": "number",                                                                                                                      
          "vat_amount": "number",                                                                                                                    
          "total": "number",                                                                                                                         
          "currency": "string"                                                                                                                       
        },                                                                                                                                           
        "line_items": [{                                                                                                                             
          "date": "string",                                                                                                                          
          "description": "string",                                                                                                                   
          "amount": "number",                                                                                                                        
          "quantity": "number",                                                                                                                      
          "unit_price": "number",                                                                                                                    
          "currency": "string",                                                                                                                      
          "vat_rate": "number",                                                                                                                      
          "vat_amount": "number",                                                                                                                    
          "reference_id": "string"                                                                                                                   
        }]                                                                                                                                           
      }                                                                                                                                              
    }                                                                                                                                                
  }                                                                                                                                                  
                                                                                                                                                     
  ---                                                                                                                                                
  2. BANK TRANSACTION (transactions where transaction_type IN ('bank_regular', 'bank_cc_charge'))                                                    
                                                                                                                                                     
  {                                                                                                                                                  
    "id": "uuid",                                                                                                                                    
    "user_id": "uuid",                                                                                                                               
    "team_id": "uuid",                                                                                                                               
    "source_file_id": "uuid",                                                                                                                        
    "date": "date",                                                                                                                                  
    "value_date": "date",                                                                                                                            
    "description": "string",                                                                                                                         
    "reference": "string",                                                                                                                           
    "amount_agorot": "numeric",                                                                                                                      
    "balance_agorot": "numeric",                                                                                                                     
    "is_income": "boolean",                                                                                                                          
    "is_credit_card_charge": "boolean",                                                                                                              
    "channel": "string",                                                                                                                             
    "hash": "string",                                                                                                                                
    "transaction_type": "string",                                                                                                                    
    "credit_card_id": "uuid",                                                                                                                        
    "linked_credit_card_id": "uuid",                                                                                                                 
    "parent_bank_charge_id": "uuid",                                                                                                                 
    "foreign_amount_cents": "integer",                                                                                                               
    "foreign_currency": "string",                                                                                                                    
    "has_vat": "boolean",                                                                                                                            
    "vat_percentage": "numeric",                                                                                                                     
    "vat_amount_agorot": "integer",                                                                                                                  
    "normalized_description": "string",                                                                                                              
    "match_status": "string",                                                                                                                        
    "match_confidence": "numeric",                                                                                                                   
    "created_at": "timestamp"                                                                                                                        
  }                                                                                                                                                  
                                                                                                                                                     
  ---                                                                                                                                                
  3. CREDIT CARD PURCHASE (transactions where transaction_type = 'cc_purchase')                                                                      
                                                                                                                                                     
  {                                                                                                                                                  
    "id": "uuid",                                                                                                                                    
    "user_id": "uuid",                                                                                                                               
    "team_id": "uuid",                                                                                                                               
    "source_file_id": "uuid",                                                                                                                        
    "date": "date",                                                                                                                                  
    "value_date": "date",                                                                                                                            
    "description": "string",                                                                                                                         
    "reference": "string",                                                                                                                           
    "amount_agorot": "numeric",                                                                                                                      
    "balance_agorot": "numeric",                                                                                                                     
    "is_income": "boolean",                                                                                                                          
    "is_credit_card_charge": "boolean",                                                                                                              
    "channel": "string",                                                                                                                             
    "hash": "string",                                                                                                                                
    "transaction_type": "string",                                                                                                                    
    "credit_card_id": "uuid",                                                                                                                        
    "linked_credit_card_id": "uuid",                                                                                                                 
    "parent_bank_charge_id": "uuid",                                                                                                                 
    "foreign_amount_cents": "integer",                                                                                                               
    "foreign_currency": "string",                                                                                                                    
    "has_vat": "boolean",                                                                                                                            
    "vat_percentage": "numeric",                                                                                                                     
    "vat_amount_agorot": "integer",                                                                                                                  
    "normalized_description": "string",                                                                                                              
    "match_status": "string",                                                                                                                        
    "match_confidence": "numeric",                                                                                                                   
    "created_at": "timestamp",                                                                                                                       
                                                                                                                                                     
    "credit_card": {                                                                                                                                 
      "id": "uuid",                                                                                                                                  
      "card_last_four": "string",                                                                                                                    
      "card_name": "string",                                                                                                                         
      "card_type": "string"                                                                                                                          
    }                                                                                                                                                
  }                                                                                                                                                  
                                                                                                                                                     
  ---                                                                                                                                                
  4. CREDIT CARD (credit_cards)                                                                                                                      
                                                                                                                                                     
  {                                                                                                                                                  
    "id": "uuid",                                                                                                                                    
    "user_id": "uuid",                                                                                                                               
    "team_id": "uuid",                                                                                                                               
    "card_last_four": "string",                                                                                                                      
    "card_name": "string",                                                                                                                           
    "card_type": "string",                                                                                                                           
    "created_at": "timestamp"                                                                                                                        
  }                             
  so idailly when we want to match cc transaction/bank to line item (cc-cc charge work already) we will send both of the rellevant json and ask      
  him to give us from 1-100 what is the % of fitting, and we should use that right?