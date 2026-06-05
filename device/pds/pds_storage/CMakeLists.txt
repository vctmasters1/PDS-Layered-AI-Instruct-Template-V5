idf_component_register(
    SRCS "pds_nvs.c"
         "pds_config_store.c"
         "pds_usrset.c"
    INCLUDE_DIRS "include"
    REQUIRES pds_core pds_network nvs_flash
)

