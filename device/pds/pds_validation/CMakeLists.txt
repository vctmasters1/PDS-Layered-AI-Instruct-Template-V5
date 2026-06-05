idf_component_register(
    SRCS "pds_validation.c"
    INCLUDE_DIRS "include"
    REQUIRES pds_core
    PRIV_REQUIRES pds_network
)

